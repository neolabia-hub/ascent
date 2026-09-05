// RECORRIDO: UNA FORMACION CON CONVOCATORIA PERMANENTE **Y** UNA JORNADA PRESENCIAL.
//
// ─── EL CASO, Y POR QUE NO ES RARO ───
//
// Lo planteo el cliente preguntando por "las inducciones que pueden ser presenciales, como las
// especificas". Ese tipo abre su convocatoria PERMANENTE sola al publicar —es autoservicio— y
// despues alguien programa ademas una jornada en salon y convoca. Es el camino normal, no una
// esquina.
//
// ─── LO QUE ENCONTRO (2026-09-06) ───
//
// El enroll de ADMINISTRADOR deduplicaba solo dentro de la misma jornada (miraba unicamente el
// `offeringId`), asi que convocar a alguien que ya estaba en la permanente le creaba una SEGUNDA
// inscripcion. MEDIDO: `PERMANENT/ENROLLED` + `EVENT/COMPLETED` — al cerrar la jornada por
// asistencia, la permanente se quedaba **viva para siempre**, contando como inscrita en los
// numeros de esa convocatoria y apareciendole a la persona en sus pendientes.
//
// Es el mismo fallo que `varias-convocatorias.mjs` encontro el 2026-09-04 y que se arreglo en el
// AUTOSERVICIO (`learner.service`); este camino, el del administrador, se quedo igual — y la
// asistencia lo volvio alcanzable en el flujo normal.
//
// ─── LO QUE HACE AHORA ───
//
// Convocar RETIRA la inscripcion viva que hubiera en otra convocatoria de la misma formacion. No
// se reutiliza —la persona no saldria en la lista de esta jornada y no se le podria tomar
// asistencia, que es justo a lo que se le convoca— y no se borra: queda WITHDRAWN, con su rastro
// (Decision #11).
import { crearCliente, paso, ok, mal, comprobar, resumen } from './api.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `SONDA${marca}`;
await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

const tipos = (await admin.get('/catalogs/activity-types')).cuerpo ?? [];
const tipo = tipos.find((t) => t.code === 'INDUCCION_ESPECIFICA');
const procesos = (await admin.get('/catalogs/processes')).cuerpo ?? [];
const proceso = procesos.find((p) => p.active) ?? procesos[0];
const cargos = ((await admin.get('/catalogs/job-titles')).cuerpo ?? []).filter((c) => c.active);
const areas = ((await admin.get('/catalogs/areas')).cuerpo ?? []).filter((a) => a.active);

paso(1, 'UNA INDUCCION ESPECIFICA PRESENCIAL: al publicar se abre su convocatoria PERMANENTE');
const ficha = await admin.post('/activities', {
  code: `SND_${SUFIJO}`, name: `Sonda especifica ${SUFIJO}`,
  activityTypeId: tipo.id, processId: proceso.id, modality: 'PRESENCIAL',
});
const activityId = ficha.cuerpo?.id;
const versionId = ((await admin.get(`/activities/${activityId}`)).cuerpo?.versions ?? []).find((v) => v.status === 'DRAFT')?.id;
const l = await admin.post('/lessons', { title: `Leccion sonda ${SUFIJO}`, estimatedMinutes: 5 });
await admin.pedir(`/lessons/${l.cuerpo.id}/cards`, { method: 'PUT', body: JSON.stringify({
  cards: [{ payload: { cardType: 'TEXT_IMAGE', title: 'Antes de empezar', body: 'Inspeccion del puesto de trabajo.' } }] }) });
await admin.post(`/activities/versions/${versionId}/contents`, {
  type: 'LESSON', title: 'Contenido', isRequired: true, config: { minSeconds: 1 }, lessonId: l.cuerpo.id });
const q = await admin.post('/questions', { payload: {
  qtype: 'SINGLE', stem: '¿Que se hace antes de empezar la tarea?',
  options: [{ id: 'a', text: 'Se inspecciona el puesto' }, { id: 'b', text: 'Se empieza sin mas' }],
  correctOptionId: 'a', points: 1 } });
const ex = await admin.post('/assessments', { title: `Examen sonda ${SUFIJO}` });
const patchEx = await admin.patch(`/assessments/${ex.cuerpo.id}`, { passingScore: 80, maxAttempts: 3, sections: [{ mode: 'FIXED', questionIds: [q.cuerpo?.id] }] });
comprobar(patchEx.ok, `examen armado (${patchEx.estado})`, `patch examen: ${patchEx.estado} ${JSON.stringify(patchEx.cuerpo).slice(0,220)} · pregunta=${JSON.stringify(q.cuerpo).slice(0,120)}`);
await admin.post(`/activities/versions/${versionId}/contents`, {
  type: 'ASSESSMENT', title: 'Examen', isRequired: true, config: {}, assessmentId: ex.cuerpo.id });
const pub = await admin.post(`/activities/versions/${versionId}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
comprobar(pub.ok, 'publicada', `publicar: ${pub.estado} ${JSON.stringify(pub.cuerpo).slice(0, 200)}`);

const abiertas = ((await admin.get(`/offerings?activityId=${activityId}`)).cuerpo?.items ?? []);
const permanente = abiertas.find((o) => o.kind === 'PERMANENT');
comprobar(!!permanente, `se abrio sola la convocatoria PERMANENTE (${abiertas.length} en total)`, 'no se abrio la permanente');

paso(2, 'Y ADEMAS SE PROGRAMA UNA JORNADA PRESENCIAL, que es lo que hace el cliente');
const cargo = cargos[0];
const area = areas[0];
const doc = `SN${marca}`;
const persona = await admin.post('/users', {
  documentNumber: doc, fullName: `Sonda ${SUFIJO}`, email: `${doc.toLowerCase()}@recorrido.test`,
  jobTitleId: cargo.id, areaId: area.id });
comprobar(persona.ok, `persona creada (${persona.estado})`, `alta: ${persona.estado} ${JSON.stringify(persona.cuerpo).slice(0,260)}`);
const userId = persona.cuerpo?.id ?? persona.cuerpo?.user?.id;

const jornada = await admin.post('/offerings', {
  activityVersionId: versionId, kind: 'EVENT', modality: 'PRESENCIAL',
  scheduledDate: new Date().toISOString().slice(0, 10), startTime: '08:00', endTime: '10:00',
  location: `Sala ${SUFIJO}`, capacity: 10 });
await admin.post(`/offerings/${jornada.cuerpo?.id}/publish`, { confirm: true });

// Primero se le inscribe en la PERMANENTE (o entra sola), y despues se le convoca a la jornada.
const enPermanente = await admin.post(`/offerings/${permanente.id}/enroll`, { userIds: [userId] });
comprobar(enPermanente.ok, 'inscrita en la permanente', `permanente: ${enPermanente.estado}`);
const enJornada = await admin.post(`/offerings/${jornada.cuerpo?.id}/enroll`, { userIds: [userId] });
comprobar(enJornada.ok, 'y convocada a la jornada', `jornada: ${enJornada.estado} ${JSON.stringify(enJornada.cuerpo).slice(0, 200)}`);

paso(3, 'LA PREGUNTA: ¿cuantas inscripciones tiene de la MISMA formacion?');
const enLista = async (offId) => ((await admin.get(`/offerings/${offId}/roster`)).cuerpo?.items ?? []).filter((f) => f.user.id === userId);
const enLaPermanente = await enLista(permanente.id);
const enLaJornada = await enLista(jornada.cuerpo?.id);
const vivasAhora = [...enLaPermanente, ...enLaJornada].filter((f) => f.status === 'ENROLLED' || f.status === 'IN_PROGRESS');
console.log(`   ... permanente: ${enLaPermanente.map((f) => f.status).join(', ') || 'sin fila'} · jornada: ${enLaJornada.map((f) => f.status).join(', ') || 'sin fila'}`);
const items = vivasAhora;
comprobar(
  items.length === 1,
  'UNA sola inscripcion VIVA: convocarla a la jornada retira la que tenia en la permanente',
  `tiene ${items.length} inscripciones vivas de la misma formacion — al cerrar una, la otra se queda para siempre`,
);
comprobar(
  enLaJornada.length === 1,
  'y la viva es la de la JORNADA, que es donde se le va a tomar asistencia',
  'no aparece en la lista de la jornada a la que se le convoco',
);

paso(4, 'Y SI SE TOMA ASISTENCIA EN LA JORNADA, ¿se cierra?');
const lista = (await admin.get(`/offerings/${jornada.cuerpo?.id}/roster`)).cuerpo?.items ?? [];
console.log(`   ... la lista de la jornada trae ${lista.length}`);
if (lista.length > 0) {
  const r = await admin.post(`/offerings/${jornada.cuerpo?.id}/attendance`, {
    items: [{ enrollmentId: lista[0].id, estado: 'PRESENT' }] });
  console.log(`   ... asistencia: cerradas=${r.cuerpo?.cerradas} ignoradas=${(r.cuerpo?.ignoradas ?? []).length}`);
  comprobar(r.cuerpo?.cerradas === 1, 'la asistencia cierra su formacion', `cerradas=${r.cuerpo?.cerradas}`);
}
const trasCerrar = [...(await enLista(permanente.id)), ...(await enLista(jornada.cuerpo?.id))];
console.log(`   ... y despues: ${trasCerrar.map((e) => e.status).join(', ')}`);
const vivas = trasCerrar.filter((e) => e.status === 'ENROLLED' || e.status === 'IN_PROGRESS');
comprobar(
  vivas.length === 0,
  'y no queda ninguna inscripcion viva colgando',
  `quedan ${vivas.length} inscripcion(es) vivas de una formacion que ya esta cumplida`,
);

console.log(`\nCREADO: actividad=${activityId} persona=${userId} sufijo=${SUFIJO}`);
paso(5, 'Y QUE CREAR LA FICHA CON EL DESVIO PUESTO LO GUARDE');
/*
  El esquema aceptaba `tracksExternalCertificate` al CREAR y el servicio lo ignoraba en silencio:
  solo se persistia al editar. Una formacion creada diciendo "la acredita un tercero" nacia
  heredando de su tipo, y nadie se enteraba hasta abrir la lista de asistencia y no ver los campos.
*/
const conDesvio = await admin.post('/activities', {
  code: `SNDV_${SUFIJO}`, name: `Sonda con desvio ${SUFIJO}`,
  activityTypeId: tipo.id, processId: proceso.id, modality: 'PRESENCIAL',
  tracksExternalCertificate: true,
});
comprobar(conDesvio.ok, 'ficha creada diciendo que la acredita un tercero', `ficha: ${conDesvio.estado} ${JSON.stringify(conDesvio.cuerpo).slice(0, 200)}`);
const leida = (await admin.get(`/activities/${conDesvio.cuerpo?.id}`)).cuerpo;
comprobar(
  leida?.tracksExternalCertificate === true,
  'y se guardo: crear con el desvio puesto no se pierde',
  `la ficha dice ${leida?.tracksExternalCertificate} y se creo con true — el servicio lo estaba ignorando`,
);

process.exit(resumen() === 0 ? 0 : 1);
