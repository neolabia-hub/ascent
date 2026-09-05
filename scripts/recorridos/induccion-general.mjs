// RECORRIDO DE PUNTA A PUNTA: INDUCCION GENERAL.
// De la ficha al certificado, pasando por contenido, examen, publicacion, asignacion y el aprendiz.
import { crearCliente, paso, ok, mal, comprobar, resumen } from './api.mjs';
import { comprobarSeguimiento } from './seguimiento.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;
const creado = { activityId: null, userId: null, lessonId: null, assessmentId: null, offeringId: null };

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

paso(1, 'CATALOGOS: lo que la ficha necesita');
const tipos = (await admin.get('/catalogs/activity-types')).cuerpo;
const tipo = tipos.find((t) => t.code === 'INDUCCION_GENERAL');
const procesos = (await admin.get('/catalogs/processes')).cuerpo;
const cargos = (await admin.get('/catalogs/job-titles')).cuerpo;
const areas = (await admin.get('/catalogs/areas')).cuerpo;
comprobar(!!tipo, `tipo "Induccion general" existe`, 'NO existe el tipo INDUCCION_GENERAL');
comprobar(procesos?.length > 0, `${procesos?.length} procesos`, 'no hay procesos: la ficha los exige');
const proceso = procesos.find((p) => p.active) ?? procesos[0];
const cargo = cargos.find((c) => c.active);
const area = areas.find((a) => a.active);
console.log(`   ... tipo=${tipo?.name} proceso=${proceso?.name} cargo=${cargo?.name} area=${area?.name}`);
console.log(`   ... el tipo pide: examen=${tipo?.config?.requiresAssessment} constancia=${tipo?.config?.issuesCertificate} encuesta=${tipo?.config?.requiresSurvey ?? false} antesDelIngreso=${tipo?.config?.requiresBeforeHire}`);

paso(2, 'LA FICHA: crear la formacion');
const ficha = await admin.post('/activities', {
  code: `IND_${SUFIJO}`,
  name: `Induccion general ${SUFIJO}`,
  description: 'Recorrido automatico de punta a punta.',
  activityTypeId: tipo.id,
  processId: proceso.id,
  modality: 'VIRTUAL',
});
comprobar(ficha.ok, `ficha creada (${ficha.estado})`, `no se pudo crear la ficha: ${ficha.estado} ${JSON.stringify(ficha.cuerpo)}`);
creado.activityId = ficha.cuerpo?.id;
if (!creado.activityId) { resumen(); process.exit(1); }

const detalle = (await admin.get(`/activities/${creado.activityId}`)).cuerpo;
let versionId = detalle?.versions?.find((v) => v.status === 'DRAFT')?.id;
comprobar(!!versionId, 'la ficha nace con una version en BORRADOR', 'no nacio ninguna version en borrador');

paso(3, 'CONTENIDO: una leccion con tarjetas');
const leccion = await admin.post('/lessons', { title: `Bienvenida ${SUFIJO}`, estimatedMinutes: 5 });
comprobar(leccion.ok, 'leccion creada', `leccion: ${leccion.estado} ${JSON.stringify(leccion.cuerpo)}`);
creado.lessonId = leccion.cuerpo?.id;
if (creado.lessonId) {
  const tarjetas = await admin.pedir(`/lessons/${creado.lessonId}/cards`, { method: 'PUT', body: JSON.stringify({
    cards: [
      { payload: { cardType: 'TEXT_IMAGE', title: 'Bienvenido', body: 'Esto es la induccion general de la empresa.' } },
      { payload: { cardType: 'TEXT_IMAGE', title: 'Seguridad', body: 'Lo primero es la seguridad de todos.' } },
    ],
  }) });
  comprobar(tarjetas.ok, '2 tarjetas guardadas', `tarjetas: ${tarjetas.estado} ${JSON.stringify(tarjetas.cuerpo).slice(0, 200)}`);
}
const contLeccion = await admin.post(`/activities/versions/${versionId}/contents`, {
  type: 'LESSON', title: 'Bienvenida', isRequired: true, config: { minSeconds: 1 }, lessonId: creado.lessonId,
});
comprobar(contLeccion.ok, 'la leccion entra como contenido de la version', `contenido: ${contLeccion.estado} ${JSON.stringify(contLeccion.cuerpo).slice(0, 200)}`);

paso(4, 'EXAMEN: el tipo lo exige, asi que la version lo lleva');
const pregunta = await admin.post('/questions', {
  payload: {
    qtype: 'SINGLE',
    stem: 'En esta empresa, lo primero es...',
    options: [
      { id: 'a', text: 'La seguridad de todos' },
      { id: 'b', text: 'Terminar rapido' },
    ],
    correctOptionId: 'a',
    points: 1,
  },
});
comprobar(pregunta.ok, 'pregunta creada', `pregunta: ${pregunta.estado} ${JSON.stringify(pregunta.cuerpo).slice(0, 200)}`);
const examen = await admin.post('/assessments', { title: `Examen induccion ${SUFIJO}` });
comprobar(examen.ok, 'examen creado', `examen: ${examen.estado} ${JSON.stringify(examen.cuerpo).slice(0, 200)}`);
creado.assessmentId = examen.cuerpo?.id;
const armado = await admin.patch(`/assessments/${creado.assessmentId}`, {
  passingScore: 80,
  maxAttempts: 3,
  sections: [{ mode: 'FIXED', questionIds: [pregunta.cuerpo?.id] }],
});
comprobar(armado.ok, 'examen armado: 1 pregunta fija, nota minima 80', `armar: ${armado.estado} ${JSON.stringify(armado.cuerpo).slice(0, 200)}`);
const contExamen = await admin.post(`/activities/versions/${versionId}/contents`, {
  type: 'ASSESSMENT', title: 'Examen', isRequired: true, config: {}, assessmentId: creado.assessmentId,
});
comprobar(contExamen.ok, 'el examen entra como contenido', `contenido examen: ${contExamen.estado} ${JSON.stringify(contExamen.cuerpo).slice(0, 200)}`);

paso(5, 'PUBLICAR: y ver si se exige sola');
const antesDePublicar = (await admin.get(`/activities/${creado.activityId}/requirements`)).cuerpo;
comprobar((antesDePublicar ?? []).length === 0, 'antes de publicar no se le exige a nadie', `ya habia ${antesDePublicar?.length} requisitos antes de publicar`);

const publicada = await admin.post(`/activities/versions/${versionId}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
comprobar(publicada.ok, `publicada (${publicada.estado})`, `publicar: ${publicada.estado} ${JSON.stringify(publicada.cuerpo).slice(0, 300)}`);

const requisitos = (await admin.get(`/activities/${creado.activityId}/requirements`)).cuerpo ?? [];
comprobar(requisitos.length === 1, 'al publicar nacio UN requisito solo, sin que nadie lo pidiera', `nacieron ${requisitos.length} requisitos`);
const req = requisitos[0];
if (req) {
  console.log(`   ... alcance=${req.reach} obligadas=${req.assignmentCount} soloNuevos=${req.soloNuevos} disparador=${req.trigger} vence=${req.dueDaysAfterTrigger}d`);
  comprobar(req.soloNuevos === true, 'es "solo a quien entre desde ahora" (correcto para una induccion de ingreso)', 'deberia ser solo para nuevos y no lo es');
  comprobar(req.trigger === 'ON_HIRE', 'se dispara con el INGRESO', `disparador inesperado: ${req.trigger}`);
  comprobar(req.dueDaysAfterTrigger < 0, 'vence ANTES del ingreso (D1072)', `deberia vencer antes del ingreso: ${req.dueDaysAfterTrigger}`);
  comprobar(req.assignmentCount === 0, 'hoy no obliga a nadie: la gente ya estaba', `obliga a ${req.assignmentCount} y no deberia`);
}

paso(6, 'LA CONVOCATORIA: la abre el tipo, no la persona');
const versionPublicada = ((await admin.get(`/activities/${creado.activityId}`)).cuerpo?.versions ?? [])
  .find((v) => v.status === 'PUBLISHED');
comprobar(!!versionPublicada, 'la version quedo PUBLICADA', 'ninguna version quedo publicada');
// El tipo dice `defaultOfferingKind: PERMANENT`, asi que publicar la abre sola. No se crea a mano:
// hacerlo dejaria DOS convocatorias para la misma version.
const convocatorias = (await admin.get(`/offerings?activityId=${creado.activityId}`)).cuerpo;
const abiertas = (convocatorias?.items ?? convocatorias ?? []).filter((o) => o.status === 'PUBLISHED');
comprobar(abiertas.length === 1, 'al publicar se abrio UNA convocatoria sola', `hay ${abiertas.length} convocatorias publicadas`);
if (abiertas[0]) {
  creado.offeringId = abiertas[0].id;
  comprobar(abiertas[0].kind === 'PERMANENT', 'es PERMANENTE: siempre abierta, sin fecha de sesion', `tipo de convocatoria: ${abiertas[0].kind}`);
}

paso(7, 'LA PERSONA, creada DESPUES de publicar (el orden correcto)');
const documento = `E2E${marca}`;
const alta = await admin.post('/users', {
  documentNumber: documento,
  fullName: `Persona Recorrido ${SUFIJO}`,
  email: `${documento.toLowerCase()}@recorrido.test`,
  jobTitleId: cargo.id,
  areaId: area.id,
});
comprobar(alta.ok, `persona creada (${alta.estado})`, `alta: ${alta.estado} ${JSON.stringify(alta.cuerpo).slice(0, 200)}`);
creado.userId = alta.cuerpo?.id ?? alta.cuerpo?.user?.id;
const clave = alta.cuerpo?.generatedPassword ?? alta.cuerpo?.password;
comprobar(!!clave, 'la contrasena se entrega UNA vez, al crearla', 'no vino ninguna contrasena generada');

const trasElAlta = ((await admin.get(`/activities/${creado.activityId}/requirements`)).cuerpo ?? [])[0];
comprobar(
  trasElAlta?.assignmentCount === 1,
  'a la persona nueva le nacio la obligacion SOLA',
  `esperaba 1 obligacion y hay ${trasElAlta?.assignmentCount}`,
);

paso(8, 'EL APRENDIZ: entra y ve lo suyo');
const aprendiz = crearCliente();
let entro = false;
try { await aprendiz.entrar(documento, clave); entro = true; } catch (e) { mal(`no pudo entrar: ${e.message}`); }
if (entro) {
  ok('entra con su documento y la contrasena generada');
  const pendientes = (await aprendiz.get('/me/pending')).cuerpo;
  const mia = (pendientes?.items ?? pendientes ?? []).find((p) => p.activity?.id === creado.activityId || p.activityId === creado.activityId);
  comprobar(!!mia, 'la induccion le aparece en sus pendientes', `no le aparece: ${JSON.stringify(pendientes).slice(0, 300)}`);

  const inscripcion = await aprendiz.post('/me/enroll', { offeringId: creado.offeringId });
  comprobar(inscripcion.ok, 'se inscribe', `inscribir: ${inscripcion.estado} ${JSON.stringify(inscripcion.cuerpo).slice(0, 200)}`);
  const enrollmentId = inscripcion.cuerpo?.enrollmentId ?? inscripcion.cuerpo?.id;

  if (enrollmentId) {
    const curso = (await aprendiz.get(`/me/enrollments/${enrollmentId}`)).cuerpo;
    const piezas = curso?.contents ?? curso?.version?.contents ?? [];
    console.log(`   ... la formacion trae ${piezas.length} piezas: ${piezas.map((c) => c.type).join(', ')}`);
    const pideEncuesta = tipo?.config?.requiresSurvey === true;
    const esperadas = 2 + (pideEncuesta ? 1 : 0);
    comprobar(
      piezas.length === esperadas,
      `llegan las ${esperadas} piezas que el tipo pide`,
      `llegaron ${piezas.length} y se esperaban ${esperadas}`,
    );
    if (pideEncuesta) {
      comprobar(
        piezas[piezas.length - 1]?.type === 'SURVEY',
        'la encuesta va la ULTIMA: se opina despues de hacerla, no antes',
        `la encuesta no va al final: ${piezas.map((c) => c.type).join(', ')}`,
      );
    }

    const laLeccion = piezas.find((c) => c.type === 'LESSON');
    if (laLeccion) {
      const avance = await aprendiz.post(`/me/contents/${laLeccion.id}/progress`, { pct: 100, secondsSpent: 60, source: 'DECLARED' });
      comprobar(avance.ok, 'marca la leccion como vista', `avance: ${avance.estado} ${JSON.stringify(avance.cuerpo).slice(0, 200)}`);
    }

        // El examen que responde la gente es la COPIA CONGELADA que hizo la publicacion, no el
    // borrador que se edita: el id sale de la pieza de la version, no del que se creo arriba.
    const elExamen = piezas.find((c) => c.type === 'ASSESSMENT');
    const examenId = elExamen?.assessmentId ?? elExamen?.assessment?.id;
    comprobar(!!examenId && examenId !== creado.assessmentId, `el examen viaja congelado (copia distinta del borrador)`, `no se congelo copia: ${examenId} vs ${creado.assessmentId}`);
    const intento = await aprendiz.post(`/me/enrollments/${enrollmentId}/attempts?assessmentId=${examenId}`, {});
    comprobar(intento.ok, 'abre el examen', `intento: ${intento.estado} ${JSON.stringify(intento.cuerpo).slice(0, 250)}`);
    const attemptId = intento.cuerpo?.id ?? intento.cuerpo?.attempt?.id;
    if (attemptId) {
      const preguntas = intento.cuerpo?.questions ?? (await aprendiz.get(`/me/attempts/${attemptId}`)).cuerpo?.questions ?? [];
      console.log(`   ... el examen trae ${preguntas.length} pregunta(s)`);
      for (const pregunta of preguntas) {
        const r = await aprendiz.post(`/me/attempts/${attemptId}/answers`, {
          attemptQuestionId: pregunta.attemptQuestionId,
          answer: { optionId: 'a' },
        });
        if (!r.ok) mal(`guardar respuesta: ${r.estado} ${JSON.stringify(r.cuerpo).slice(0, 160)}`);
      }
      const entrega = await aprendiz.post(`/me/attempts/${attemptId}/submit`, {});
      comprobar(entrega.ok, `examen entregado: nota ${entrega.cuerpo?.score ?? '?'} · ${entrega.cuerpo?.passed ? 'APROBADO' : 'reprobado'}`, `entregar: ${entrega.estado} ${JSON.stringify(entrega.cuerpo).slice(0, 250)}`);
      comprobar(entrega.cuerpo?.passed === true, 'aprueba con la respuesta correcta', 'no aprobo con la respuesta correcta');
    }
  }
}

paso(9, 'LO QUE SE EMITE AL TERMINAR: constancia y encuesta');
const constancias = (await aprendiz.get('/me/certificados')).cuerpo;
const lista = constancias?.items ?? constancias ?? [];
const mia = lista.find?.((c) => c.activityName?.includes(SUFIJO) || c.activity?.id === creado.activityId);
if (tipo?.config?.issuesCertificate) {
  comprobar(!!mia, 'el tipo emite constancia y la constancia esta', `el tipo emite constancia pero no aparece ninguna (${lista.length ?? 0} en total)`);
  if (mia) console.log(`   ... constancia ${mia.code ?? mia.verificationCode ?? ''}`);
} else {
  ok('el tipo no emite constancia: correcto que no haya');
}

/*
  LA ENCUESTA NO ES UN PENDIENTE APARTE: es una PIEZA de la formacion, la ultima, y no requerida.
  Se comprueba donde de verdad esta, que es en el temario que recibe quien la cursa.
*/
ok(tipo?.config?.requiresSurvey === true
  ? 'la encuesta viaja como pieza de la formacion (comprobado arriba)'
  : 'el tipo no pide encuesta y no se anadio ninguna');

await comprobarSeguimiento(admin, creado.activityId, { numeroDePaso: 11, usuarioId: creado.userId, estadoEsperado: 'TERMINADA' });

paso(10, 'ASISTENCIA: solo aplica a lo presencial');
console.log('   ... la formacion es VIRTUAL: se acredita completando el contenido, no marcando asistencia');
ok('no aplica, y es correcto');

console.log(`\nCREADO PARA LIMPIAR: actividad=${creado.activityId} usuario=${creado.userId} sufijo=${SUFIJO}`);
process.exit(resumen() === 0 ? 0 : 1);
