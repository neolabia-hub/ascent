// RECORRIDO DE PUNTA A PUNTA: UN PROGRAMA DE REINDUCCION ENTERO, Y SU SEGUNDA VEZ (2026-10-06).
//
// Pedido del cliente: probar la reinduccion como PROGRAMA con todo lo que puede llevar —contenido,
// evaluacion, encuesta y asistencia— y comprobar que la SEGUNDA vez se la vuelve a pedir.
//
//   M1  virtual: leccion + examen + encuesta. Se cierra cursandolo.
//   M2  presencial: se cierra por ASISTENCIA, en una jornada con lista tomada a mano.
//   M3  virtual: leccion + examen + encuesta.
//
// LA RECURRENCIA VA COMPRIMIDA A UN MES, igual que en `reinduccion-ciclos.mjs`: no se puede
// adelantar el reloj por HTTP, y el motor no distingue «un mes» de «un año» —calcula el vencimiento
// siguiente y lo compara con la antelacion—. Con un mes y 120 dias de antelacion, la ronda 2 esta
// en su ventana en cuanto se cumple la 1, que es lo que con doce meses pasaria un año despues.

import { crearCliente, paso, ok, mal, comprobar, resumen } from './api.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;

function fecha({ dias = 0 }) {
  const hoy = new Date(Date.now() - 5 * 60 * 60 * 1000);
  const base = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()));
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}
function masMeses(texto, meses) {
  const [a, m, d] = texto.split('-').map(Number);
  const total = a * 12 + (m - 1) + meses;
  const anio = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return `${anio}-${String(mes).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
}
const diaCivil = (instante) => new Date(new Date(instante).getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

const procesos = (await admin.get('/catalogs/processes')).cuerpo ?? [];
const proceso = procesos.find((p) => p.active) ?? procesos[0];
const cargo = ((await admin.get('/catalogs/job-titles')).cuerpo ?? []).find((c) => c.active);
const area = ((await admin.get('/catalogs/areas')).cuerpo ?? []).find((a) => a.active);
const reglasCreadas = [];
let tipoId = null;

paso(1, 'EL TIPO: reinduccion por fecha de ingreso, con examen, encuesta y constancia');
const plantillas = (await admin.get('/survey-templates')).cuerpo ?? [];
const encuesta = (plantillas.items ?? plantillas).find?.((p) => p.active !== false && (p.kind ?? 'SATISFACTION') === 'SATISFACTION');
comprobar(!!encuesta, `hay una encuesta de satisfaccion: «${encuesta?.name}»`, 'no hay ninguna encuesta de satisfaccion activa');
const tipo = await admin.post('/catalogs/activity-types', {
  code: `E2E_PRC_${marca}`,
  name: `Reinduccion completa ${SUFIJO}`,
  config: {
    requiresAssessment: true,
    requiresSurvey: !!encuesta,
    surveyTemplateId: encuesta?.id ?? null,
    issuesCertificate: true,
    defaultOfferingKind: 'PERMANENT',
    defaultAssignmentMode: 'ON_HIRE',
    requiresBeforeHire: false,
    defaultRecurrenceMonths: 1,
    defaultRecurrenceAnchor: 'HIRE',
    defaultWindowDays: 120,
    defaultGraceDays: 10,
    defaultOnExpiry: 'CIERRA',
  },
});
comprobar(tipo.ok, 'tipo creado', `tipo: ${tipo.estado} ${JSON.stringify(tipo.cuerpo).slice(0, 250)}`);
if (!tipo.ok) { resumen(); process.exit(1); }
tipoId = tipo.cuerpo.id;

paso(2, 'LA PERSONA: ingreso hace 40 dias, asi que ya paso su primer mes');
const ingreso = fecha({ dias: -40 });
const documento = `83${marca}`;
const alta = await admin.post('/users', {
  documentNumber: documento, fullName: `Reinduccion completa ${SUFIJO}`, jobTitleId: cargo.id, areaId: area.id, hiredAt: ingreso,
});
const persona = { id: alta.cuerpo?.user?.id, clave: alta.cuerpo?.generatedPassword };
comprobar(alta.ok && !!persona.id, `creada, con ingreso el ${ingreso}`, `alta: ${alta.estado} ${JSON.stringify(alta.cuerpo).slice(0, 200)}`);

async function crearExamen(nombre) {
  const pregunta = await admin.post('/questions', {
    payload: {
      qtype: 'SINGLE', stem: `¿Que es lo primero en ${nombre}?`,
      options: [{ id: 'a', text: 'La seguridad de todos' }, { id: 'b', text: 'Terminar rapido' }],
      correctOptionId: 'a', points: 1,
    },
  });
  const examen = await admin.post('/assessments', { title: `Examen ${nombre} ${SUFIJO}` });
  await admin.patch(`/assessments/${examen.cuerpo?.id}`, {
    passingScore: 80, maxAttempts: 3, sections: [{ mode: 'FIXED', questionIds: [pregunta.cuerpo?.id] }],
  });
  return examen.cuerpo?.id;
}

async function crearModulo(nombre, horas, modalidad) {
  const ficha = await admin.post('/activities', {
    code: `PRC${marca}_${nombre}`, name: `Reinduccion ${nombre} ${SUFIJO}`, activityTypeId: tipoId, processId: proceso.id,
    modality: modalidad, issuesCertificate: true, certificateHours: horas,
  });
  if (!ficha.ok) { mal(`crear ${nombre}: ${ficha.estado} ${JSON.stringify(ficha.cuerpo).slice(0, 200)}`); return null; }
  const activityId = ficha.cuerpo.id;
  const versionId = ((await admin.get(`/activities/${activityId}`)).cuerpo?.versions ?? []).find((v) => v.status === 'DRAFT')?.id;
  const leccion = await admin.post('/lessons', { title: `Contenido ${nombre} ${SUFIJO}`, estimatedMinutes: 5 });
  await admin.pedir(`/lessons/${leccion.cuerpo?.id}/cards`, {
    method: 'PUT',
    body: JSON.stringify({ cards: [{ payload: { cardType: 'TEXT_IMAGE', title: nombre, body: 'Contenido del recorrido.' } }] }),
  });
  await admin.post(`/activities/versions/${versionId}/contents`, {
    type: 'LESSON', title: `Contenido ${nombre}`, isRequired: true, config: { minSeconds: 1 }, lessonId: leccion.cuerpo?.id,
  });
  await admin.post(`/activities/versions/${versionId}/contents`, {
    type: 'ASSESSMENT', title: `Examen ${nombre}`, isRequired: true, config: {}, assessmentId: await crearExamen(nombre),
  });
  const publicada = await admin.post(`/activities/versions/${versionId}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
  if (!publicada.ok) { mal(`publicar ${nombre}: ${publicada.estado} ${JSON.stringify(publicada.cuerpo).slice(0, 250)}`); return null; }
  const convocatorias = ((await admin.get(`/offerings?activityId=${activityId}`)).cuerpo?.items ?? []).filter((o) => o.status === 'PUBLISHED');
  for (const regla of (await admin.get(`/activities/${activityId}/requirements`)).cuerpo ?? []) reglasCreadas.push({ activityId, ruleId: regla.id });
  return { nombre, activityId, versionId, horas, offeringId: convocatorias[0]?.id ?? null };
}

const rondasDe = async (activityId) =>
  ((await admin.get(`/assignments?targetId=${activityId}&userId=${persona.id}`)).cuerpo?.items ?? []).sort(
    (a, b) => a.cycleNumber - b.cycleNumber,
  );
const constanciasDe = async () => ((await admin.get(`/certificates?userId=${persona.id}`)).cuerpo ?? []).filter((c) => c.typeName === 'Programa');

/** El aprendiz cursa un modulo virtual entero: leccion, examen y encuesta. */
async function cursar(aprendiz, modulo, vez) {
  const inscripcion = await aprendiz.post('/me/enroll', { offeringId: modulo.offeringId });
  if (!inscripcion.ok) { mal(`${vez} inscribir ${modulo.nombre}: ${inscripcion.estado} ${JSON.stringify(inscripcion.cuerpo).slice(0, 250)}`); return; }
  const enrollmentId = inscripcion.cuerpo?.enrollmentId ?? inscripcion.cuerpo?.id;
  const curso = (await aprendiz.get(`/me/enrollments/${enrollmentId}`)).cuerpo;
  const piezas = curso?.contents ?? curso?.version?.contents ?? [];
  console.log(`   ... ${modulo.nombre}: ${piezas.map((c) => c.type).join(', ')}`);

  const laLeccion = piezas.find((c) => c.type === 'LESSON');
  const avance = await aprendiz.post(`/me/contents/${laLeccion?.id}/progress`, { pct: 100, secondsSpent: 60, source: 'DECLARED' });
  comprobar(avance.ok, `${vez} ${modulo.nombre}: ve el contenido`, `${modulo.nombre} avance: ${avance.estado} ${JSON.stringify(avance.cuerpo).slice(0, 200)}`);

  const elExamen = piezas.find((c) => c.type === 'ASSESSMENT');
  const examenId = elExamen?.assessmentId ?? elExamen?.assessment?.id;
  const intento = await aprendiz.post(`/me/enrollments/${enrollmentId}/attempts?assessmentId=${examenId}`, {});
  if (!intento.ok) { mal(`${vez} ${modulo.nombre} abrir examen: ${intento.estado} ${JSON.stringify(intento.cuerpo).slice(0, 250)}`); return; }
  const attemptId = intento.cuerpo?.id ?? intento.cuerpo?.attempt?.id;
  const preguntas = intento.cuerpo?.questions ?? (await aprendiz.get(`/me/attempts/${attemptId}`)).cuerpo?.questions ?? [];
  for (const pregunta of preguntas) {
    await aprendiz.post(`/me/attempts/${attemptId}/answers`, { attemptQuestionId: pregunta.attemptQuestionId, answer: { optionId: 'a' } });
  }
  const entrega = await aprendiz.post(`/me/attempts/${attemptId}/submit`, {});
  comprobar(entrega.cuerpo?.passed === true, `${vez} ${modulo.nombre}: aprueba la evaluacion (${entrega.cuerpo?.score ?? '?'})`, `${modulo.nombre} no aprobo: ${JSON.stringify(entrega.cuerpo).slice(0, 200)}`);

  if (encuesta) {
    const laEncuesta = piezas.find((c) => c.type === 'SURVEY');
    comprobar(!!laEncuesta && piezas[piezas.length - 1]?.type === 'SURVEY', `${vez} ${modulo.nombre}: la encuesta va la ultima`, `${modulo.nombre}: piezas ${piezas.map((c) => c.type).join(', ')}`);
    const formulario = (await aprendiz.get(`/me/enrollments/${enrollmentId}/surveys/${encuesta.id}`)).cuerpo;
    const preguntasEncuesta = formulario?.questions ?? formulario?.template?.questions ?? [];
    const respuestas = {};
    for (const q of preguntasEncuesta) {
      const clase = String(q.type ?? q.kind ?? '').toUpperCase();
      respuestas[q.id ?? q.key] = /BOOL|YES|SI_NO/.test(clase) ? true : /TEXT|OPEN|COMMENT/.test(clase) ? 'Bien explicado.' : (q.max ?? q.scaleMax ?? 5);
    }
    const enviada = await aprendiz.post(`/me/enrollments/${enrollmentId}/surveys/${encuesta.id}`, { answers: respuestas });
    comprobar(enviada.ok, `${vez} ${modulo.nombre}: responde la encuesta (${preguntasEncuesta.length} preguntas)`, `${modulo.nombre} encuesta: ${enviada.estado} ${JSON.stringify(enviada.cuerpo).slice(0, 300)} · tipos: ${preguntasEncuesta.map((q) => q.type ?? q.kind).join(',')}`);
  }
}

/** Una jornada presencial del modulo: se programa, se convoca a la persona y se le toma lista. */
async function asistirAJornada(modulo, vez, desde, hasta) {
  const hoy = new Date().toISOString().slice(0, 10);
  const jornada = await admin.post('/offerings', {
    activityVersionId: modulo.versionId, kind: 'EVENT', modality: 'PRESENCIAL', scheduledDate: hoy, startTime: desde, endTime: hasta,
    location: `Aula ${SUFIJO}`, capacity: 20, intensityTheoryHours: 4, intensityPracticeHours: 0,
  });
  comprobar(jornada.ok, `${vez}: jornada programada`, `jornada: ${jornada.estado} ${JSON.stringify(jornada.cuerpo).slice(0, 250)}`);
  await admin.post(`/offerings/${jornada.cuerpo?.id}/publish`, { confirm: true });
  const convocar = await admin.post(`/offerings/${jornada.cuerpo?.id}/enroll`, { userIds: [persona.id] });
  comprobar(convocar.ok, `${vez}: la persona queda convocada`, `convocar: ${convocar.estado} ${JSON.stringify(convocar.cuerpo).slice(0, 200)}`);
  const lista = (await admin.get(`/offerings/${jornada.cuerpo?.id}/roster`)).cuerpo?.items ?? [];
  const suFila = lista.find((f) => f.user?.id === persona.id);
  const asistencia = await admin.post(`/offerings/${jornada.cuerpo?.id}/attendance`, {
    heldOn: hoy, items: [{ enrollmentId: suFila?.id, estado: 'PRESENT' }],
  });
  comprobar(asistencia.ok && asistencia.cuerpo?.cerradas === 1, `${vez}: se cierra por haber ASISTIDO`, `asistencia: ${asistencia.estado} ${JSON.stringify(asistencia.cuerpo).slice(0, 250)}`);
}

try {
  paso(3, 'TRES MODULOS de varios tipos, y el PROGRAMA publicado');
  const M1 = await crearModulo('M1', 2, 'VIRTUAL');
  const M2 = await crearModulo('M2', 4, 'PRESENCIAL');
  const M3 = await crearModulo('M3', 1, 'VIRTUAL');
  if (!M1 || !M2 || !M3) throw new Error('no se pudieron crear los tres modulos');
  const modulos = [M1, M2, M3];
  const programa = await admin.post('/programas', { code: `PRC_${SUFIJO}`, name: `Programa de reinduccion completo ${SUFIJO}` });
  for (const m of modulos) await admin.post(`/programas/${programa.cuerpo?.id}/modulos`, { activityId: m.activityId, isRequired: true });
  const publicar = await admin.post(`/programas/${programa.cuerpo?.id}/publicar`);
  comprobar(publicar.ok, 'programa publicado con sus tres modulos', `publicar: ${publicar.estado} ${JSON.stringify(publicar.cuerpo).slice(0, 250)}`);

  paso(4, 'PRIMERA VEZ: le nacen los tres modulos, con SU fecha');
  const vence1 = masMeses(ingreso, 2);
  for (const m of modulos) {
    const rondas = await rondasDe(m.activityId);
    comprobar(
      rondas.length === 1 && rondas[0].status === 'PENDING' && diaCivil(rondas[0].dueAt) === vence1,
      `${m.nombre}: ronda 1 pendiente, vence el ${vence1}`,
      `${m.nombre}: ${rondas.map((r) => `#${r.cycleNumber} ${r.status} ${diaCivil(r.dueAt)}`).join(' · ') || 'nada'}`,
    );
  }

  paso(5, 'M1: CONTENIDO, EVALUACION Y ENCUESTA');
  const aprendiz = crearCliente();
  await aprendiz.entrar(documento, persona.clave);
  await cursar(aprendiz, M1, '1a vez');
  comprobar((await rondasDe(M1.activityId))[0]?.status === 'COMPLETED', 'M1 queda cumplido', `M1: ${(await rondasDe(M1.activityId))[0]?.status}`);
  comprobar((await constanciasDe()).length === 0, 'con un modulo de tres, todavia no hay constancia', 'emitio constancia con modulos pendientes');

  paso(6, 'M2: POR ASISTENCIA, en una jornada presencial con lista a mano');
  await asistirAJornada(M2, '1a vez', '08:00', '12:00');
  comprobar((await rondasDe(M2.activityId))[0]?.status === 'COMPLETED', 'M2 queda cumplido', `M2: ${(await rondasDe(M2.activityId))[0]?.status}`);

  paso(7, 'M3, Y LA CONSTANCIA DEL PROGRAMA');
  await cursar(aprendiz, M3, '1a vez');
  const constancias = await constanciasDe();
  comprobar(constancias.length === 1, 'nace UNA constancia, la del programa', `tiene ${constancias.length}`);
  comprobar(constancias[0]?.hours === 7, 'con la suma de las horas de los tres modulos (7 h)', `dice ${constancias[0]?.hours} h`);
  const vence2 = masMeses(ingreso, 3);
  comprobar(
    !!constancias[0]?.validUntil && diaCivil(constancias[0].validUntil) === vence2,
    `vigente hasta el ${vence2}: el dia en que vence la siguiente`,
    `vigente hasta ${constancias[0]?.validUntil ? diaCivil(constancias[0].validUntil) : '(sin fecha)'} y se esperaba ${vence2}`,
  );

  paso('7 bis', 'VENCIMIENTOS: la constancia del programa avisa de que va a caducar');
  const enVencimientos = async () =>
    ((await admin.get('/reportes/vencimientos?meses=24')).cuerpo?.items ?? []).filter((f) => f.personaId === persona.id);
  const antesDeLaSegunda = await enVencimientos();
  const delPrograma = antesDeLaSegunda.find((f) => String(f.formacion).startsWith('Programa: '));
  console.log(`   ... sus filas: ${antesDeLaSegunda.map((f) => `${f.formacion} [${f.clase}] ${diaCivil(f.fecha)}`).join(' · ') || '(ninguna)'}`);
  comprobar(
    !!delPrograma && diaCivil(delPrograma.fecha) === vence2 && delPrograma.clase === 'REPROGRAMAR',
    `sale «${delPrograma?.formacion}», por reprogramar, con fecha ${vence2}`,
    'la constancia del programa no sale en Vencimientos',
  );

  paso(8, 'SEGUNDA VEZ: llega la antelacion de la siguiente y SE LA VUELVE A PEDIR');
  /*
    El motor corre en caliente cuando cambia algo de la persona; se vuelve a guardar el area que ya
    tiene, que no cambia nada y dispara la pasada — lo que hara el cron el dia que toque de verdad.
  */
  const empujon = await admin.patch(`/users/${persona.id}`, { areaId: area.id });
  comprobar(empujon.ok, 'el motor vuelve a pasar por esta persona', `patch: ${empujon.estado}`);
  for (const m of modulos) {
    const rondas = await rondasDe(m.activityId);
    const segunda = rondas.find((r) => r.cycleNumber === 2);
    comprobar(
      rondas.length === 2 && rondas[0].status === 'COMPLETED' && segunda?.status === 'PENDING' && diaCivil(segunda.dueAt) === vence2,
      `${m.nombre}: la ronda 1 sigue cumplida y nace la RONDA 2, que vence el ${vence2}`,
      `${m.nombre}: ${rondas.map((r) => `#${r.cycleNumber} ${r.status} ${diaCivil(r.dueAt)}`).join(' · ')}`,
    );
  }

  const yaEnMarcha = await enVencimientos();
  comprobar(
    !yaEnMarcha.some((f) => String(f.formacion).startsWith('Programa: ')) &&
      yaEnMarcha.filter((f) => String(f.formacion).includes(SUFIJO)).length === 3,
    'Vencimientos: nacida la ronda 2, la fila del programa se cambia por sus tres modulos (no se cuenta dos veces)',
    `filas: ${yaEnMarcha.map((f) => f.formacion).join(' · ')}`,
  );

  paso('8 bis', 'SEGUIMIENTO NO MEZCLA LAS RONDAS: la segunda, sin empezar, no hereda lo del año pasado');
  const filaDe = async (activityId) =>
    ((await admin.get(`/reportes/actividades/${activityId}/ejecucion`)).cuerpo?.items ?? []).find((f) => f.userId === persona.id);
  const antes = await filaDe(M1.activityId);
  console.log(`   ... M1 en Seguimiento: estado=${antes?.estado} ronda=${antes?.cycleNumber} rondas=${antes?.rondas} intentos=${antes?.intentos} nota=${antes?.mejorNota} constancia=${antes?.certificadoId ? 'si' : 'no'} convocatoria=${antes?.convocatoria}`);
  comprobar(antes?.cycleNumber === 2 && antes?.rondas === 2, 'la fila es la de la ronda 2, y dice que hubo dos', `ronda=${antes?.cycleNumber} rondas=${antes?.rondas}`);
  comprobar(antes?.estado !== 'TERMINADA', 'no sale como terminada: la de este año no la ha hecho', `estado=${antes?.estado}`);
  comprobar(
    antes?.intentos === 0 && antes?.mejorNota === null && antes?.respondioEncuesta === false,
    'sin intentos, sin nota y sin encuesta: los del año pasado no cuentan para esta',
    `intentos=${antes?.intentos} nota=${antes?.mejorNota} encuesta=${antes?.respondioEncuesta}`,
  );

  paso(9, 'Y LA SEGUNDA VEZ SE PUEDE CURSAR: M1 de nuevo, con su evaluacion y su encuesta');
  await cursar(aprendiz, M1, '2a vez');
  const trasSegunda = await rondasDe(M1.activityId);
  comprobar(
    trasSegunda.find((r) => r.cycleNumber === 2)?.status === 'COMPLETED',
    'la ronda 2 de M1 queda cumplida',
    `M1: ${trasSegunda.map((r) => `#${r.cycleNumber} ${r.status}`).join(' · ')}`,
  );
  comprobar((await constanciasDe()).length === 1, 'y no hay constancia nueva hasta cerrar los tres otra vez', `tiene ${(await constanciasDe()).length}`);
  const despues = await filaDe(M1.activityId);
  comprobar(
    despues?.estado === 'TERMINADA' && despues?.intentos === 1 && Number(despues?.mejorNota) === 100 && despues?.respondioEncuesta === true,
    'Seguimiento: M1 terminada, con UN intento, su nota y su encuesta — los de esta ronda',
    `estado=${despues?.estado} intentos=${despues?.intentos} nota=${despues?.mejorNota} encuesta=${despues?.respondioEncuesta}`,
  );
  comprobar(/· Permanente$/.test(despues?.convocatoria ?? ''), `y dice de que convocatoria sale: «${despues?.convocatoria}»`, `convocatoria=${despues?.convocatoria}`);
  comprobar(
    despues?.historial?.length === 2 && despues.historial[0]?.estado === 'TERMINADA' && despues.historial[0]?.intentos === 1,
    'y lleva el HISTORIAL: los dos ciclos, cada uno con lo suyo',
    `historial=${JSON.stringify((despues?.historial ?? []).map((c) => `#${c.cycleNumber} ${c.estado} ${c.intentos}`))}`,
  );

  paso('9 bis', 'Y SE CIERRA LA SEGUNDA RONDA ENTERA: otra jornada, el tercer modulo, y SEGUNDA constancia');
  await asistirAJornada(M2, '2a vez', '14:00', '18:00');
  await cursar(aprendiz, M3, '2a vez');
  for (const m of modulos) {
    const rondas = await rondasDe(m.activityId);
    comprobar(
      rondas.filter((x) => x.status === 'COMPLETED').length === 2,
      `${m.nombre}: las dos rondas cumplidas, cada una con su registro`,
      `${m.nombre}: ${rondas.map((x) => `#${x.cycleNumber} ${x.status}`).join(' · ')}`,
    );
  }
  const dosConstancias = await constanciasDe();
  comprobar(dosConstancias.length === 2, 'hay DOS constancias del programa: una por cada vez que lo completo', `tiene ${dosConstancias.length}`);
  const vence3 = masMeses(ingreso, 4);
  const laNueva = dosConstancias.find((c) => c.validUntil && diaCivil(c.validUntil) === vence3);
  comprobar(!!laNueva, `y la nueva vale hasta el ${vence3}, un mes despues de la primera`, `vigencias: ${dosConstancias.map((c) => (c.validUntil ? diaCivil(c.validUntil) : 'sin fecha')).join(' · ')}`);
  // La de la primera vez no se toco: sigue con su fecha, como evidencia de aquella vuelta.
  comprobar(
    dosConstancias.some((c) => c.validUntil && diaCivil(c.validUntil) === vence2),
    'y la de la primera vez sigue intacta, con su fecha',
    'la primera constancia cambio o desaparecio',
  );

  paso(10, 'SEGUIMIENTO: el programa cuenta lo que paso');
  const informe = (await admin.get('/reportes/programas')).cuerpo;
  const filas = informe?.items ?? informe ?? [];
  const suyo = filas.find?.((f) => f.pathId === programa.cuerpo?.id || f.id === programa.cuerpo?.id || f.name?.includes(SUFIJO));
  comprobar(!!suyo, 'el programa aparece en Seguimiento', `no aparece; el informe trae ${filas.length ?? 0} filas`);
  if (suyo) console.log(`   ... ${Object.entries(suyo).filter(([, v]) => typeof v !== 'object').map(([k, v]) => `${k}=${v}`).join(' ')}`);
  ok(`programa=${programa.cuerpo?.id}`);
} catch (error) {
  mal(`el recorrido se corto: ${error.message}`);
} finally {
  paso(11, 'LIMPIEZA');
  for (const { activityId, ruleId } of reglasCreadas) await admin.pedir(`/activities/${activityId}/requirements/${ruleId}`, { method: 'DELETE' });
  if (tipoId) await admin.patch(`/catalogs/activity-types/${tipoId}`, { active: false });
  console.log(`CREADO PARA LIMPIAR: sufijo=${SUFIJO}`);
}

process.exit(resumen() === 0 ? 0 : 1);
