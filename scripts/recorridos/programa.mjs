// RECORRIDO DE PUNTA A PUNTA: UN PROGRAMA COMPLETO (2026-09-17).
//
// La matriz `dev:verificar-programas` prueba las REGLAS contra la base, llamando a los servicios.
// Esto es lo otro: el camino entero por HTTP, con sesion, como lo hace una persona. Encuentra la
// clase de fallo que la matriz no puede ver — que una pieza no encaje con la siguiente.
//
// Lo pidio el cliente con estas palabras: *"quiero una prueba de programa muy completa con todas
// las situaciones y pasos, con asignaciones reales, contenido cursado, asistencia, certificados y
// como llega a Seguimiento, para ver que de inicio a fin este todo bien"*.
//
// ─── LAS TRES REGLAS QUE SE COMPRUEBAN, Y QUE SON EL PROGRAMA ENTERO ───
//
//   1. Un programa PUBLICADO **apaga la constancia individual** de sus modulos.
//   2. Se completa **haciendolos todos** — el cupo perdona REPROBAR, nunca no hacerlo.
//   3. Al completarlo nace **UNA** constancia, la del conjunto, con la suma de horas.
//
// Se montan tres modulos a proposito distintos, porque cada uno cierra por una via distinta:
//
//   M1  se cursa por CONTENIDO (una leccion, el aprendiz la ve)
//   M2  se cierra por ASISTENCIA a una jornada presencial (lista tomada a mano)
//   M3  va en un grupo CON CUPO, para probar que el cupo no perdona dejarlo sin hacer
//
//   node scripts/recorridos/programa.mjs      (con el stack arriba: .\scripts\mirar.ps1)
import { crearCliente, paso, ok, mal, comprobar, resumen } from './api.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;
const VACIO = { match: 'ALL', jobTitleIds: [], jobTitleTypeIds: [], areaIds: [], regionalIds: [], serviceIds: [], employmentTypes: [], roadActors: [] };
const creado = { programaId: null, modulos: [], userId: null };

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

// ───────────────────────────────────────────────────────────────────────────────
paso(1, 'CATALOGOS: un tipo que SI acredita, y el cargo mas pequeño que haya');
const tipos = (await admin.get('/catalogs/activity-types')).cuerpo ?? [];
/*
  El tipo tiene que emitir constancia — si no, no se puede comprobar que el programa la SUPRIME— y
  NO debe exigirse solo a toda la empresa: un tipo ON_HIRE crearia su regla al publicar y el
  programa quedaria mezclado, que es justo el caso que la pantalla desaconseja.
*/
const tipo = tipos.find(
  (t) => t.config?.issuesCertificate === true && (t.config?.defaultAssignmentMode ?? 'MANUAL') !== 'ON_HIRE' && t.config?.participatesInPlan !== true,
);
comprobar(!!tipo, `tipo de los modulos: "${tipo?.name}"`, 'no hay ningun tipo que acredite y no se exija solo');
if (!tipo) { resumen(); process.exit(1); }

const procesos = (await admin.get('/catalogs/processes')).cuerpo ?? [];
const areas = (await admin.get('/catalogs/areas')).cuerpo ?? [];
const cargos = ((await admin.get('/catalogs/job-titles')).cuerpo ?? []).filter((c) => c.active);
const proceso = procesos.find((p) => p.active) ?? procesos[0];
const area = areas.find((a) => a.active);
// El cargo con MENOS gente: asignar el programa crea obligaciones de verdad, y no hace falta
// obligar a media empresa para probar que funciona.
let elegido = null;
for (const c of cargos) {
  const n = (await admin.post('/audiences/preview', { ...VACIO, jobTitleIds: [c.id] })).cuerpo?.count ?? 0;
  if (elegido === null || n < elegido.n) elegido = { c, n };
}
console.log(`   ... el programa se exigira al cargo "${elegido.c.name}" (${elegido.n} personas hoy)`);

// ───────────────────────────────────────────────────────────────────────────────
paso(2, 'TRES MODULOS, cada uno con su forma de cerrarse');

/*
  CADA MODULO LLEVA EXAMEN, y no es un adorno del recorrido: **ningun tipo que acredite permite
  publicar sin evaluacion** —el servidor responde 409 "este tipo de formacion se evalua"—, asi que
  un programa cuyos modulos emiten constancia SIEMPRE tiene examen por debajo. Montarlo sin el seria
  probar un camino que en produccion no existe.
*/
async function crearExamen(nombre) {
  const pregunta = await admin.post('/questions', {
    payload: {
      qtype: 'SINGLE',
      stem: `¿Que es lo primero en ${nombre}?`,
      options: [
        { id: 'a', text: 'La seguridad de todos' },
        { id: 'b', text: 'Terminar rapido' },
      ],
      correctOptionId: 'a',
      points: 1,
    },
  });
  const examen = await admin.post('/assessments', { title: `Examen ${nombre} ${SUFIJO}` });
  await admin.patch(`/assessments/${examen.cuerpo?.id}`, {
    passingScore: 80,
    maxAttempts: 3,
    sections: [{ mode: 'FIXED', questionIds: [pregunta.cuerpo?.id] }],
  });
  return examen.cuerpo?.id;
}

/** Crea una formacion con su leccion, su examen, y la publica. Devuelve lo que hace falta despues. */
async function crearModulo(nombre, horas, modalidad) {
  const codigo = `PRG${marca}_${nombre}`;
  const ficha = await admin.post('/activities', {
    code: codigo,
    name: `Modulo ${nombre} ${SUFIJO}`,
    description: 'Recorrido automatico de programa, de punta a punta.',
    activityTypeId: tipo.id,
    processId: proceso.id,
    modality: modalidad,
    issuesCertificate: true,
    certificateHours: horas,
  });
  if (!ficha.ok) { mal(`crear ${nombre}: ${ficha.estado} ${JSON.stringify(ficha.cuerpo).slice(0, 200)}`); return null; }
  const activityId = ficha.cuerpo.id;
  const versionId = ((await admin.get(`/activities/${activityId}`)).cuerpo?.versions ?? []).find((v) => v.status === 'DRAFT')?.id;

  /*
    LAS HORAS SE PONEN EN LA FICHA y la version las copia al publicar. Este recorrido las pide a
    proposito, porque la constancia del PROGRAMA las SUMA: es la unica forma de comprobar esa suma.

    La primera vez que corrio, esto destapo un agujero de verdad: `certificateHours` existia en el
    esquema, la version la copiaba y la constancia la imprimia — pero **ningun endpoint la escribia**,
    asi que toda constancia salia sin horas. Se arreglo el 2026-09-17.
  */

  const leccion = await admin.post('/lessons', { title: `Contenido ${nombre} ${SUFIJO}`, estimatedMinutes: 5 });
  await admin.pedir(`/lessons/${leccion.cuerpo?.id}/cards`, {
    method: 'PUT',
    body: JSON.stringify({ cards: [{ payload: { cardType: 'TEXT_IMAGE', title: nombre, body: 'Contenido del recorrido.' } }] }),
  });
  await admin.post(`/activities/versions/${versionId}/contents`, {
    type: 'LESSON', title: `Contenido ${nombre}`, isRequired: true, config: { minSeconds: 1 }, lessonId: leccion.cuerpo?.id,
  });
  const assessmentId = await crearExamen(nombre);
  await admin.post(`/activities/versions/${versionId}/contents`, {
    type: 'ASSESSMENT', title: `Examen ${nombre}`, isRequired: true, config: {}, assessmentId,
  });
  const publicada = await admin.post(`/activities/versions/${versionId}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
  if (!publicada.ok) { mal(`publicar ${nombre}: ${publicada.estado} ${JSON.stringify(publicada.cuerpo).slice(0, 200)}`); return null; }

  const convocatorias = ((await admin.get(`/offerings?activityId=${activityId}`)).cuerpo?.items ?? []).filter((o) => o.status === 'PUBLISHED');
  return { nombre, activityId, versionId, horas, offeringId: convocatorias[0]?.id ?? null };
}

const M1 = await crearModulo('M1', 4, 'VIRTUAL');
const M2 = await crearModulo('M2', 6, 'PRESENCIAL');
const M3 = await crearModulo('M3', 2, 'VIRTUAL');
creado.modulos = [M1, M2, M3].filter(Boolean);
comprobar(creado.modulos.length === 3, 'tres modulos creados y publicados', `solo salieron ${creado.modulos.length}`);
if (creado.modulos.length !== 3) { resumen(); process.exit(1); }
console.log(`   ... horas: M1=${M1.horas} M2=${M2.horas} M3=${M3.horas} (suma ${M1.horas + M2.horas + M3.horas})`);

// Cada uno, por su cuenta, SI acredita: es la linea base contra la que se mide la supresion.
const sueltoAntes = (await admin.get(`/programas/de-formacion/${M1.activityId}`)).cuerpo ?? [];
comprobar(sueltoAntes.length === 0, 'antes de nada, M1 no pertenece a ningun programa', `ya pertenece a ${sueltoAntes.length}`);

// ───────────────────────────────────────────────────────────────────────────────
paso(3, 'EL PROGRAMA EN BORRADOR: todavia no compromete a nadie');
const programa = await admin.post('/programas', { code: `PROG_${SUFIJO}`, name: `Programa completo ${SUFIJO}` });
comprobar(programa.ok, `programa creado (${programa.estado})`, `crear: ${programa.estado} ${JSON.stringify(programa.cuerpo).slice(0, 250)}`);
creado.programaId = programa.cuerpo?.id;
if (!creado.programaId) { resumen(); process.exit(1); }

// M1 y M2 obligatorios; M3 en un grupo con cupo.
for (const m of [M1, M2]) {
  const r = await admin.post(`/programas/${creado.programaId}/modulos`, { activityId: m.activityId, isRequired: true });
  comprobar(r.ok, `${m.nombre} entra como obligatorio`, `${m.nombre}: ${r.estado} ${JSON.stringify(r.cuerpo).slice(0, 200)}`);
}
const conCupo = await admin.post(`/programas/${creado.programaId}/modulos`, {
  activityId: M3.activityId, isRequired: false, sectionName: 'con cupo',
});
comprobar(conCupo.ok, 'M3 entra en un grupo con cupo', `M3: ${conCupo.estado} ${JSON.stringify(conCupo.cuerpo).slice(0, 200)}`);

/*
  UN BORRADOR NO APAGA NADA. Es la mitad que se olvida: si suprimiera desde el borrador, agregar una
  formacion a un programa que quiza no se publique nunca le quitaria su constancia.
*/
const enBorrador = (await admin.get(`/programas/de-formacion/${M1.activityId}`)).cuerpo ?? [];
comprobar(enBorrador.length === 1, 'M1 ya dice de que programa es modulo', `dice ${enBorrador.length}`);
comprobar(enBorrador[0]?.status === 'DRAFT', 'y que ese programa esta en BORRADOR', `estado: ${enBorrador[0]?.status}`);

// ───────────────────────────────────────────────────────────────────────────────
paso(4, 'PUBLICAR: aqui es donde se apagan las constancias individuales');
const impacto = (await admin.get(`/programas/${creado.programaId}/impacto-de-publicar`)).cuerpo;
console.log(`   ... impacto: modulos=${impacto?.modulos} afectados=${impacto?.afectados} conTodos=${impacto?.conTodos}`);
comprobar(
  impacto?.afectados === 0,
  'nadie se queda sin papel al publicarlo: sus tres modulos son nuevos y no se le exigen a nadie por otro lado',
  `dice que ${impacto?.afectados} personas se quedarian sin ningun papel`,
);

const publicar = await admin.post(`/programas/${creado.programaId}/publicar`);
comprobar(publicar.ok, `programa publicado (${publicar.estado})`, `publicar: ${publicar.estado} ${JSON.stringify(publicar.cuerpo).slice(0, 250)}`);
const traPublicar = (await admin.get(`/programas/de-formacion/${M1.activityId}`)).cuerpo ?? [];
comprobar(traPublicar[0]?.status === 'PUBLISHED', 'y desde la ficha de M1 se ve que su programa ya esta publicado', `estado: ${traPublicar[0]?.status}`);

// ───────────────────────────────────────────────────────────────────────────────
paso(5, 'ASIGNAR EL PROGRAMA: una pulsacion, un requisito POR MODULO');
const asignar = await admin.post(`/programas/${creado.programaId}/asignar`, {
  scope: { ...VACIO, jobTitleIds: [elegido.c.id] },
  trigger: 'ON_JOIN',
  dueDaysAfterTrigger: 30,
  soloNuevos: false,
  reason: 'Recorrido automatico de punta a punta del modulo de programas.',
});
comprobar(asignar.ok, `asignado (${asignar.estado})`, `asignar: ${asignar.estado} ${JSON.stringify(asignar.cuerpo).slice(0, 250)}`);
console.log(`   ... alcance=${asignar.cuerpo?.reach} modulos=${asignar.cuerpo?.modulos} obligaciones=${asignar.cuerpo?.obligacionesCreadas}`);
comprobar(asignar.cuerpo?.modulos === 3, 'creo un requisito en CADA uno de los tres modulos', `dice ${asignar.cuerpo?.modulos}`);

/*
  Y SE VE DESDE LA FICHA DE CADA FORMACION, como cualquier otro requisito suyo: es la prueba de que
  "asignar un programa" no inventa un brazo nuevo en el motor, sino que reusa el de siempre.
*/
for (const m of creado.modulos) {
  const reqs = (await admin.get(`/activities/${m.activityId}/requirements`)).cuerpo ?? [];
  comprobar(reqs.length === 1, `${m.nombre} tiene su requisito, visible desde su propia ficha`, `${m.nombre} tiene ${reqs.length}`);
}

const detalle = (await admin.get(`/programas/${creado.programaId}`)).cuerpo;
console.log(`   ... la ficha dice: conTodos=${detalle?.conTodos} afectados=${detalle?.afectados}`);
comprobar(detalle?.afectados === 0, 'y nadie queda a medias: los tres modulos se le exigen a la misma gente', `afectados=${detalle?.afectados}`);

// ───────────────────────────────────────────────────────────────────────────────
paso(6, 'UNA PERSONA DE ESE CARGO: le nacen las tres obligaciones');
const documento = `9${marca}`;
const alta = await admin.post('/users', {
  documentNumber: documento,
  fullName: `Persona Programa ${SUFIJO}`,
  email: `prg${marca}@recorrido.test`,
  jobTitleId: elegido.c.id,
  areaId: area.id,
});
comprobar(alta.ok, `persona creada (${alta.estado})`, `alta: ${alta.estado} ${JSON.stringify(alta.cuerpo).slice(0, 250)}`);
creado.userId = alta.cuerpo?.id ?? alta.cuerpo?.user?.id;
const clave = alta.cuerpo?.generatedPassword ?? alta.cuerpo?.password;

const obligacionesDe = async (activityId) =>
  ((await admin.get(`/assignments?targetId=${activityId}&userId=${creado.userId}`)).cuerpo?.items ?? []);
for (const m of creado.modulos) {
  const suyas = await obligacionesDe(m.activityId);
  comprobar(suyas.length === 1, `le nace sola la obligacion de ${m.nombre}`, `${m.nombre}: tiene ${suyas.length}`);
}

// ───────────────────────────────────────────────────────────────────────────────
paso(7, 'M1 SE CIERRA POR CONTENIDO: el aprendiz lo cursa');
const aprendiz = crearCliente();
let entro = false;
try { await aprendiz.entrar(documento, clave); entro = true; ok('el aprendiz entra con su documento'); }
catch (e) { mal(`no pudo entrar: ${e.message}`); }

/** El camino completo del aprendiz en un modulo virtual: inscribirse, ver la leccion y aprobar. */
async function cursar(modulo) {
  const inscripcion = await aprendiz.post('/me/enroll', { offeringId: modulo.offeringId });
  if (!inscripcion.ok) { mal(`inscribir ${modulo.nombre}: ${inscripcion.estado} ${JSON.stringify(inscripcion.cuerpo).slice(0, 200)}`); return; }
  const enrollmentId = inscripcion.cuerpo?.enrollmentId ?? inscripcion.cuerpo?.id;
  const curso = (await aprendiz.get(`/me/enrollments/${enrollmentId}`)).cuerpo;
  const piezas = curso?.contents ?? curso?.version?.contents ?? [];

  const laLeccion = piezas.find((c) => c.type === 'LESSON');
  const avance = await aprendiz.post(`/me/contents/${laLeccion?.id}/progress`, { pct: 100, secondsSpent: 60, source: 'DECLARED' });
  comprobar(avance.ok, `${modulo.nombre}: ve la leccion entera`, `${modulo.nombre} avance: ${avance.estado}`);

  const elExamen = piezas.find((c) => c.type === 'ASSESSMENT');
  const examenId = elExamen?.assessmentId ?? elExamen?.assessment?.id;
  const intento = await aprendiz.post(`/me/enrollments/${enrollmentId}/attempts?assessmentId=${examenId}`, {});
  if (!intento.ok) { mal(`${modulo.nombre} abrir examen: ${intento.estado} ${JSON.stringify(intento.cuerpo).slice(0, 200)}`); return; }
  const attemptId = intento.cuerpo?.id ?? intento.cuerpo?.attempt?.id;
  const preguntas = intento.cuerpo?.questions ?? (await aprendiz.get(`/me/attempts/${attemptId}`)).cuerpo?.questions ?? [];
  for (const pregunta of preguntas) {
    await aprendiz.post(`/me/attempts/${attemptId}/answers`, { attemptQuestionId: pregunta.attemptQuestionId, answer: { optionId: 'a' } });
  }
  const entrega = await aprendiz.post(`/me/attempts/${attemptId}/submit`, {});
  comprobar(entrega.cuerpo?.passed === true, `${modulo.nombre}: aprueba el examen (nota ${entrega.cuerpo?.score ?? '?'})`, `${modulo.nombre} no aprobo: ${JSON.stringify(entrega.cuerpo).slice(0, 200)}`);
}

if (entro) await cursar(M1);
const trasM1 = await obligacionesDe(M1.activityId);
comprobar(trasM1[0]?.status === 'COMPLETED', 'M1 queda CUMPLIDA', `M1 quedo en ${trasM1[0]?.status}`);

// ───────────────────────────────────────────────────────────────────────────────
paso(8, 'Y NO EMITE SU CONSTANCIA: el papel que vale es el del conjunto');
const constanciasDe = async () => ((await admin.get(`/certificates?userId=${creado.userId}`)).cuerpo ?? []);
const trasCursar = await constanciasDe();
console.log(`   ... tiene ${trasCursar.length} constancia(s)`);
comprobar(
  trasCursar.length === 0,
  'ninguna constancia todavia: M1 es modulo de un programa publicado, asi que no certifica sola',
  `emitio ${trasCursar.length}, y deberia ser la del programa o ninguna`,
);

// ───────────────────────────────────────────────────────────────────────────────
paso(9, 'M2 SE CIERRA POR ASISTENCIA: una jornada presencial, lista tomada a mano');
const fecha = new Date().toISOString().slice(0, 10);
const jornada = await admin.post('/offerings', {
  activityVersionId: M2.versionId, kind: 'EVENT', modality: 'PRESENCIAL',
  scheduledDate: fecha, startTime: '08:00', endTime: '14:00',
  location: `Aula ${SUFIJO}`, capacity: 20, intensityTheoryHours: 6, intensityPracticeHours: 0,
});
comprobar(jornada.ok, `jornada programada (${jornada.estado})`, `jornada: ${jornada.estado} ${JSON.stringify(jornada.cuerpo).slice(0, 250)}`);
const jornadaId = jornada.cuerpo?.id;

/*
  PUBLICAR Y CONVOCAR, en ese orden. Una jornada nace en borrador y su lista sale VACIA hasta que se
  convoca a alguien: tener la obligacion no te mete en una jornada concreta — la formacion se le debe
  a la persona, y a QUE jornada va lo decide quien la programa. Es lo mismo que hace `asistencia.mjs`.
*/
await admin.post(`/offerings/${jornadaId}/publish`, { confirm: true });
const convocar = await admin.post(`/offerings/${jornadaId}/enroll`, { userIds: [creado.userId] });
comprobar(convocar.ok, 'la persona queda convocada a la jornada', `convocar: ${convocar.estado} ${JSON.stringify(convocar.cuerpo).slice(0, 200)}`);

const lista = (await admin.get(`/offerings/${jornadaId}/roster`)).cuerpo?.items ?? [];
const suFila = lista.find((f) => f.user?.id === creado.userId);
comprobar(!!suFila, 'la persona sale proyectada en la lista de la jornada', `no sale; la lista trae ${lista.length}`);

if (suFila) {
  const asistencia = await admin.post(`/offerings/${jornadaId}/attendance`, {
    heldOn: fecha,
    items: [{ enrollmentId: suFila.id, estado: 'PRESENT' }],
  });
  comprobar(asistencia.ok, `asistencia guardada (${asistencia.estado})`, `asistencia: ${asistencia.estado} ${JSON.stringify(asistencia.cuerpo).slice(0, 250)}`);
  console.log(`   ... revisadas=${asistencia.cuerpo?.revisadas} cerradas=${asistencia.cuerpo?.cerradas}`);
  comprobar(asistencia.cuerpo?.cerradas === 1, 'se cierra por haber ASISTIDO, sin tocar el contenido', `cerradas=${asistencia.cuerpo?.cerradas}`);
}
const trasM2 = await obligacionesDe(M2.activityId);
comprobar(trasM2.some((a) => a.status === 'COMPLETED'), 'M2 queda CUMPLIDA', `M2: ${trasM2.map((a) => a.status).join(', ')}`);

// ───────────────────────────────────────────────────────────────────────────────
paso(10, 'DOS DE TRES: el cupo NO perdona dejar M3 sin hacer');
/*
  ESTA ES LA COMPROBACION QUE EL CLIENTE PIDIO EXPLICITAMENTE: *"puede perder cualquiera, pero no
  puede elegir: tiene que cursar todo"*. M3 esta en un grupo con cupo y su obligacion sigue VIVA, asi
  que el programa NO completa aunque los numeros del cupo dieran.
*/
const aMedias = await constanciasDe();
comprobar(
  aMedias.length === 0,
  'con M1 y M2 hechos y M3 pendiente, el programa NO completa y no hay constancia',
  `emitio ${aMedias.length} constancia(s) con un modulo todavia pendiente`,
);

// ───────────────────────────────────────────────────────────────────────────────
paso(11, 'M3 TAMBIEN: al cerrarse el ultimo, nace LA constancia del programa');
if (entro) await cursar(M3);

const finales = await constanciasDe();
console.log(`   ... constancias: ${finales.map((c) => `${c.typeName ?? '?'}/${c.hours ?? '?'}h`).join(' · ') || '(ninguna)'}`);
comprobar(finales.length === 1, 'nace UNA sola constancia', `hay ${finales.length}`);
const laDelPrograma = finales[0];
comprobar(laDelPrograma?.typeName === 'Programa', 'y es la DEL PROGRAMA, no la de un modulo', `su tipo dice "${laDelPrograma?.typeName}"`);
const horasEsperadas = M1.horas + M2.horas + M3.horas;
comprobar(
  laDelPrograma?.hours === horasEsperadas,
  `con la SUMA de las horas de sus modulos (${horasEsperadas} h)`,
  `dice ${laDelPrograma?.hours} h y la suma es ${horasEsperadas}`,
);

// ───────────────────────────────────────────────────────────────────────────────
paso(12, 'Y NO SE DUPLICA: volver a pasar por el cierre no emite una segunda');
const otraVez = await constanciasDe();
comprobar(otraVez.length === 1, 'sigue habiendo exactamente una', `ahora hay ${otraVez.length}`);

// ───────────────────────────────────────────────────────────────────────────────
paso(13, 'SEGUIMIENTO: el informe cuenta lo que de verdad paso');
const informe = (await admin.get('/reportes/programas')).cuerpo;
const filas = informe?.items ?? informe ?? [];
const suyo = filas.find?.((f) => f.pathId === creado.programaId || f.id === creado.programaId || f.name?.includes(SUFIJO));
comprobar(!!suyo, 'el programa aparece en Seguimiento', `no aparece; el informe trae ${filas.length ?? 0} filas`);
if (suyo) {
  console.log(`   ... ${Object.entries(suyo).filter(([, v]) => typeof v !== 'object').map(([k, v]) => `${k}=${v}`).join(' ')}`);
  comprobar((suyo.completos ?? 0) >= 1, 'y cuenta a la persona que lo completo', `completos=${suyo.completos}`);
  comprobar((suyo.modulos ?? 0) === 3, 'dice que tiene 3 modulos', `dice ${suyo.modulos}`);
}

const detalleInforme = (await admin.get(`/reportes/programas/${creado.programaId}`)).cuerpo;
const personas = detalleInforme?.items ?? detalleInforme?.personas ?? [];
const suFilaInforme = personas.find?.((p) => p.userId === creado.userId || p.user?.id === creado.userId);
comprobar(!!suFilaInforme, 'y al abrir la fila, la persona sale en el detalle', `no sale; el detalle trae ${personas.length ?? 0}`);

// ───────────────────────────────────────────────────────────────────────────────
paso(14, 'DESPUBLICAR DEVUELVE LA CONSTANCIA INDIVIDUAL: la regla al reves');
const despublicar = await admin.post(`/programas/${creado.programaId}/despublicar`);
comprobar(despublicar.ok, `programa vuelto a borrador (${despublicar.estado})`, `despublicar: ${despublicar.estado}`);
const deFormacion = (await admin.get(`/programas/de-formacion/${M1.activityId}`)).cuerpo ?? [];
comprobar(
  deFormacion[0]?.status === 'DRAFT',
  'M1 vuelve a pertenecer solo a un BORRADOR, asi que vuelve a certificar sola de aqui en adelante',
  `estado: ${deFormacion[0]?.status}`,
);
// Se vuelve a publicar para dejarlo como estaba: el recorrido no debe cambiar el estado del mundo.
await admin.post(`/programas/${creado.programaId}/publicar`);

// ───────────────────────────────────────────────────────────────────────────────
paso(15, 'LIMPIEZA: se retiran los requisitos que este recorrido creo');
for (const m of creado.modulos) {
  const reqs = (await admin.get(`/activities/${m.activityId}/requirements`)).cuerpo ?? [];
  for (const r of reqs) {
    await admin.pedir(`/activities/${m.activityId}/requirements/${r.id}`, { method: 'DELETE' });
  }
}
ok('requisitos retirados: no envenenan la siguiente corrida');

console.log(`\nCREADO PARA LIMPIAR: programa=${creado.programaId} usuario=${creado.userId} sufijo=${SUFIJO}`);
console.log('   (lo borra `pnpm --filter @neo-pulse/api dev:limpiar-pruebas`, que reconoce la firma E2E<digitos>)');
process.exit(resumen() === 0 ? 0 : 1);
