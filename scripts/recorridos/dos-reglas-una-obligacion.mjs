// RECORRIDO: DOS REGLAS VIVAS, UNA SOLA OBLIGACION (`PENDIENTES` 4.1).
//
// ─── EL FALLO QUE CIERRA ───
//
// Una formacion exigida por DOS reglas vivas —por el cargo Y por el area, que se solapan— le nacia
// DOS VECES a la misma persona: la segunda regla no tiene historia suya y le abria su ronda 1 sin
// mirar si ya la debia por otra parte.
//
// Estaba anotado como "no se ha visto en la practica". Se vio el 2026-09-08, escribiendo el
// recorrido de las dos puertas: una persona de prueba tenia dos obligaciones PENDING de la misma
// formacion, y otra tenia una CUMPLIDA y otra ABIERTA a la vez.
//
// Lo que se ve cuando pasa: dos filas identicas en los pendientes de la persona, y un denominador
// inflado en el informe de cumplimiento —una persona contada dos veces por la misma formacion— que
// hace bajar el porcentaje sin que nadie haya dejado de hacer nada.
//
// ─── LO QUE COMPRUEBA ───
//
//   1. Con las DOS reglas vivas y solapadas, a una persona nueva le nace UNA sola obligacion.
//   2. Y sigue siendo una despues de que el motor pase otra vez: no es que llegue tarde, es que no
//      la crea.
//   3. Cumplirla la cierra del todo: no queda ninguna abierta por la otra regla.
//   4. AUTO-SANADO: si se retira la regla que la creo, la otra la vuelve a crear — la obligacion
//      sigue viva porque sigue habiendo quien la exija. Y tampoco duplica al volver.
//   5. Y la persona cuenta UNA vez en los informes: Vencimientos y Seguimiento.
//
//   node scripts/recorridos/dos-reglas-una-obligacion.mjs
import { crearCliente, paso, ok, comprobar, resumen } from './api.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;
const hoy = new Date().toISOString().slice(0, 10);

const ABIERTAS = ['PENDING', 'IN_PROGRESS', 'OVERDUE'];

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(1, 'MONTAJE: una formacion que NO es del plan (el plan dispara distinto)');

const tipos = (await admin.get('/catalogs/activity-types')).cuerpo ?? [];
/*
  Se descarta lo que participa en el PLAN: alli la obligacion la dispara el renglon del plan y el
  requisito se fuerza a `trigger: PLAN` (Decision #76), asi que no habria dos reglas compitiendo.
  Y MICROLEARNING, que no se dicta en jornada.
*/
const tipo = (tipos ?? []).find(
  (t) => t.active !== false && t.code !== 'MICROLEARNING' && t.config?.participatesInPlan !== true,
);
comprobar(!!tipo, `tipo utilizable: ${tipo?.code}`, 'no hay ningun tipo fuera del plan con el que probar');
if (!tipo) { resumen(); process.exit(1); }

const procesos = (await admin.get('/catalogs/processes')).cuerpo ?? [];
const proceso = procesos.find((p) => p.active) ?? procesos[0];
const cargos = ((await admin.get('/catalogs/job-titles')).cuerpo ?? []).filter((c) => c.active);
const areas = ((await admin.get('/catalogs/areas')).cuerpo ?? []).filter((a) => a.active);
const poblacion = new Map();
for (const c of cargos) {
  poblacion.set(c.id, (await admin.post('/audiences/preview', { match: 'ALL', jobTitleIds: [c.id] })).cuerpo?.count ?? 0);
}
const cargo = [...cargos].sort((a, b) => poblacion.get(a.id) - poblacion.get(b.id))[0];
const area = areas[0];

const ficha = await admin.post('/activities', {
  code: `DOSR_${SUFIJO}`, name: `Exigida dos veces ${SUFIJO}`,
  activityTypeId: tipo.id, processId: proceso.id, modality: 'PRESENCIAL',
});
const activityId = ficha.cuerpo?.id;
const versionId = ((await admin.get(`/activities/${activityId}`)).cuerpo?.versions ?? []).find((v) => v.status === 'DRAFT')?.id;
const lec = await admin.post('/lessons', { title: `Contenido ${SUFIJO}`, estimatedMinutes: 5 });
await admin.pedir(`/lessons/${lec.cuerpo.id}/cards`, {
  method: 'PUT',
  body: JSON.stringify({ cards: [{ payload: { cardType: 'TEXT_IMAGE', title: 'Antes', body: 'Revision.' } }] }),
});
await admin.post(`/activities/versions/${versionId}/contents`, {
  type: 'LESSON', title: 'Contenido', isRequired: true, config: { minSeconds: 1 }, lessonId: lec.cuerpo.id,
});
if (tipo.config?.requiresAssessment !== false) {
  const preg = await admin.post('/questions', {
    payload: { qtype: 'SINGLE', stem: 'Antes de operar...', options: [{ id: 'a', text: 'Se revisa' }, { id: 'b', text: 'Se arranca' }], correctOptionId: 'a', points: 1 },
  });
  const ex = await admin.post('/assessments', { title: `Examen ${SUFIJO}` });
  await admin.patch(`/assessments/${ex.cuerpo.id}`, {
    passingScore: 80, maxAttempts: 3, sections: [{ mode: 'FIXED', questionIds: [preg.cuerpo?.id] }],
  });
  await admin.post(`/activities/versions/${versionId}/contents`, {
    type: 'ASSESSMENT', title: 'Examen', isRequired: true, config: {}, assessmentId: ex.cuerpo.id,
  });
}
const publicada = await admin.post(`/activities/versions/${versionId}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
comprobar(publicada.ok, 'formacion publicada', `${publicada.estado} ${JSON.stringify(publicada.cuerpo).slice(0, 200)}`);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(2, 'DOS REGLAS QUE SE SOLAPAN: una por el cargo y otra por el area');

const reglaCargo = await admin.post(`/activities/${activityId}/requirements`, {
  scope: { match: 'ALL', jobTitleIds: [cargo.id] },
  trigger: 'ON_JOIN', dueDaysAfterTrigger: 30, everyMonths: 12, soloNuevos: true,
});
const reglaArea = await admin.post(`/activities/${activityId}/requirements`, {
  scope: { match: 'ALL', areaIds: [area.id] },
  trigger: 'ON_JOIN', dueDaysAfterTrigger: 45, everyMonths: 12, soloNuevos: true,
});
comprobar(reglaCargo.ok && reglaArea.ok, 'las dos reglas se crean', `${reglaCargo.estado} / ${reglaArea.estado}`);

const requisitos = (await admin.get(`/activities/${activityId}/requirements`)).cuerpo ?? [];
const vivas = (Array.isArray(requisitos) ? requisitos : requisitos.items ?? []).filter((r) => r.active !== false);
comprobar(
  vivas.length >= 2,
  `hay ${vivas.length} reglas vivas sobre la misma formacion — sin esto la prueba no probaria nada`,
  `solo hay ${vivas.length}: la segunda regla no se creo, o piso a la primera`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(3, 'UNA PERSONA NUEVA, UNA SOLA OBLIGACION');

let n = 0;
async function alta(nombre) {
  n += 1;
  const doc = `DR${marca}${n}`;
  const r = await admin.post('/users', {
    documentNumber: doc, fullName: `${nombre} ${SUFIJO}`,
    email: `${doc.toLowerCase()}@recorrido.test`, jobTitleId: cargo.id, areaId: area.id,
  });
  return { id: r.cuerpo?.id ?? r.cuerpo?.user?.id, doc };
}

const suyas = async (userId) =>
  ((await admin.get(`/assignments?targetId=${activityId}&userId=${userId}&pageSize=50`)).cuerpo?.items ?? []);
const abiertasDe = async (userId) => (await suyas(userId)).filter((a) => ABIERTAS.includes(a.status));

const persona = await alta('Doble regla');
const primeras = await abiertasDe(persona.id);
comprobar(
  primeras.length === 1,
  'le nace UNA obligacion, aunque dos reglas vivas se la exigen',
  `le nacieron ${primeras.length}: ${JSON.stringify(primeras.map((a) => [a.status, a.dueAt?.slice(0, 10)]))}`,
);

// Y el motor volviendo a pasar tampoco la duplica: no es que llegue tarde, es que no la crea.
await admin.patch(`/assignment-rules/${reglaArea.cuerpo?.ruleId}`, { active: true });
const trasPasar = await abiertasDe(persona.id);
comprobar(
  trasPasar.length === 1,
  'y sigue siendo una despues de que el motor vuelva a pasar por la otra regla',
  `ahora hay ${trasPasar.length}`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(4, 'CUMPLIRLA LA CIERRA DEL TODO: la otra regla no deja una abierta detras');

const jornada = await admin.post('/offerings', {
  activityVersionId: versionId, kind: 'EVENT', modality: 'PRESENCIAL',
  scheduledDate: hoy, startTime: '08:00', endTime: '12:00', location: `Salon ${SUFIJO}`,
  capacity: 10, intensityTheoryHours: 2, intensityPracticeHours: 2,
});
const offeringId = jornada.cuerpo?.id;
await admin.post(`/offerings/${offeringId}/publish`, { confirm: true });
await admin.post(`/offerings/${offeringId}/enroll`, { userIds: [persona.id] });
const fila = ((await admin.get(`/offerings/${offeringId}/roster`)).cuerpo?.items ?? []).find((f) => f.user?.id === persona.id);
await admin.post(`/offerings/${offeringId}/attendance`, {
  heldOn: hoy, items: [{ enrollmentId: fila?.id, estado: 'PRESENT' }],
});

const tras = await suyas(persona.id);
comprobar(
  tras.filter((a) => a.status === 'COMPLETED').length === 1,
  'queda CUMPLIDA una vez',
  `cumplidas=${tras.filter((a) => a.status === 'COMPLETED').length}`,
);
comprobar(
  tras.filter((a) => ABIERTAS.includes(a.status)).length === 0,
  'y NINGUNA abierta: hizo la formacion, no la debe por partida doble',
  `siguen abiertas ${tras.filter((a) => ABIERTAS.includes(a.status)).length}`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(5, 'AUTO-SANADO: si se retira la regla que la creo, la otra la vuelve a crear');

const otra = await alta('Se le retira una regla');
const antesDeRetirar = await abiertasDe(otra.id);
comprobar(antesDeRetirar.length === 1, 'parte de una sola obligacion', `tiene ${antesDeRetirar.length}`);

/*
  SE RETIRAN TODAS MENOS LA DEL AREA, y no solo la del cargo.

  Publicar una induccion general CREA SOLA su regla de "toda la empresa" (ON_HIRE), asi que sobre
  esta formacion hay TRES reglas vivas y no dos — lo cual, dicho sea de paso, es la prueba de que
  esto no era un caso raro: cualquier induccion publicada y ademas exigida a un cargo ya tenia dos.
  Retirar solo una dejaria a la persona obligada por la que quedo, y la prueba diria que el retiro
  no funciona cuando lo que pasa es que sigue habiendo quien se lo exija.
*/
const todas = (await admin.get(`/activities/${activityId}/requirements`)).cuerpo ?? [];
const aRetirar = (Array.isArray(todas) ? todas : todas.items ?? []).filter((r) => r.id !== reglaArea.cuerpo?.ruleId);
let retiradas = 0;
for (const regla of aRetirar) {
  const r = await admin.pedir(`/activities/${activityId}/requirements/${regla.id}`, { method: 'DELETE' });
  if (r.ok) retiradas += 1;
}
comprobar(
  retiradas === aRetirar.length && retiradas > 0,
  `se retiran las ${retiradas} reglas que no son la del area`,
  `se retiraron ${retiradas} de ${aRetirar.length}`,
);

const traRetirar = await abiertasDe(otra.id);
comprobar(
  traRetirar.length === 0,
  'su obligacion queda retirada con motivo, no borrada',
  `siguen abiertas ${traRetirar.length}: ${JSON.stringify(traRetirar.map((a) => a.status))}`,
);

// Y el motor vuelve a pasar por la regla que SIGUE viva.
await admin.patch(`/assignment-rules/${reglaArea.cuerpo?.ruleId}`, { active: true });
const renacida = await abiertasDe(otra.id);
comprobar(
  renacida.length === 1,
  'la regla que sigue viva se la vuelve a exigir: la obligacion no se pierde',
  `hay ${renacida.length} abiertas`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(6, 'Y EN LOS INFORMES CUENTA UNA VEZ, que es donde se notaba el fallo');

const informe = (await admin.get('/reportes/vencimientos?meses=24')).cuerpo;
const suyasEnInforme = (informe?.items ?? []).filter(
  (f) => f.formacion?.includes(SUFIJO) && f.personaId === otra.id,
);
comprobar(
  suyasEnInforme.length === 1,
  'sale una sola vez en Vencimientos',
  `sale ${suyasEnInforme.length} vece(s): ${JSON.stringify(suyasEnInforme.map((f) => [f.clase, f.fuente]))}`,
);

const ejecucion = (await admin.get(`/reportes/actividades/${activityId}/ejecucion`)).cuerpo;
const filas = ejecucion?.items ?? [];
const cuantas = filas.filter((f) => f.personaId === otra.id || f.userId === otra.id).length;
comprobar(
  cuantas <= 1,
  `en Seguimiento sale ${cuantas} vez/veces, no dos: el denominador no se infla`,
  `sale ${cuantas} veces y el porcentaje de cumplimiento bajaria sin que nadie deje de hacer nada`,
);

console.log(`\nCREADO PARA LIMPIAR: sufijo=${SUFIJO}`);
process.exit(resumen() === 0 ? 0 : 1);
