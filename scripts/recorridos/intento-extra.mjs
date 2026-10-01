// RECORRIDO: DAR UN INTENTO MAS A UNA PERSONA (2026-10-01), como las «excepciones por usuario» de Moodle.
//
// El maximo de intentos es de la formacion e igual para todos. Quien los agota queda BLOQUEADO y
// REPROBADO. Antes no habia forma de levantarlo; ahora quien tiene `enrollments:unblock` le da UNO mas,
// con motivo, solo a esa persona. Se comprueba que:
//   1. agotar el unico intento bloquea y deja reprobado,
//   2. el intento extra exige motivo y permiso,
//   3. a esa persona la desbloquea, la vuelve a «en curso» y puede presentar otra vez,
//   4. a la OTRA persona, con los mismos intentos agotados, no le cambia nada,
//   (La auditoria ENROLLMENT_EXTRA_ATTEMPT no tiene endpoint de lectura: se mira en la base.)
//
//   node scripts/recorridos/intento-extra.mjs
import { crearCliente, paso, comprobar, resumen } from './api.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;
await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

const procesos = (await admin.get('/catalogs/processes')).cuerpo ?? [];
const proceso = procesos.find((p) => p.active) ?? procesos[0];
const cargos = ((await admin.get('/catalogs/job-titles')).cuerpo ?? []).filter((x) => x.active);
const areas = ((await admin.get('/catalogs/areas')).cuerpo ?? []).filter((x) => x.active);

paso(1, 'UNA FORMACION CON EXAMEN DE UN SOLO INTENTO');
const tipo = await admin.post('/catalogs/activity-types', {
  code: `INT_${marca}`,
  name: `Tipo intentos ${SUFIJO}`,
  config: { requiresAssessment: false, requiresSurvey: false, issuesCertificate: false, defaultOfferingKind: 'PERMANENT', defaultAssignmentMode: 'MANUAL' },
});
const ficha = await admin.post('/activities', {
  code: `INT_${SUFIJO}`, name: `Intentos ${SUFIJO}`, activityTypeId: tipo.cuerpo.id, processId: proceso.id, modality: 'VIRTUAL',
});
const id = ficha.cuerpo.id;
const version = (await admin.get(`/activities/${id}`)).cuerpo.versions.find((v) => v.status === 'DRAFT').id;
const pregunta = await admin.post('/questions', {
  payload: {
    qtype: 'SINGLE', stem: 'Antes de mover la estiba...',
    options: [{ id: 'a', text: 'Se revisa la carga' }, { id: 'b', text: 'Se mueve y ya' }],
    correctOptionId: 'a', points: 1,
  },
});
const examen = await admin.post('/assessments', { title: `Examen ${SUFIJO}` });
await admin.patch(`/assessments/${examen.cuerpo.id}`, {
  passingScore: 80, maxAttempts: 1, sections: [{ mode: 'FIXED', questionIds: [pregunta.cuerpo?.id] }],
});
await admin.post(`/activities/versions/${version}/contents`, {
  type: 'ASSESSMENT', title: 'Examen', isRequired: true, config: {}, assessmentId: examen.cuerpo.id,
});
const publica = await admin.post(`/activities/versions/${version}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
comprobar(publica.ok, 'publicada', `${publica.estado} ${JSON.stringify(publica.cuerpo).slice(0, 200)}`);
const convocatoria = ((await admin.get(`/offerings?activityId=${id}`)).cuerpo?.items ?? [])[0];
comprobar(!!convocatoria, 'con su convocatoria permanente');

paso(2, 'DOS PERSONAS NUEVAS, y las dos reprueban su unico intento');
const alta = async (n) => {
  const doc = `IE${marca}${n}`;
  const r = await admin.post('/users', {
    documentNumber: doc, fullName: `Persona intentos ${n} ${SUFIJO}`,
    email: `${doc.toLowerCase()}@recorrido.test`, jobTitleId: cargos[0].id, areaId: areas[0].id,
  });
  return { id: r.cuerpo?.id ?? r.cuerpo?.user?.id, doc, clave: r.cuerpo?.generatedPassword };
};
const una = await alta(1);
const otra = await alta(2);
await admin.post('/assignments', { targetType: 'ACTIVITY', targetId: id, userIds: [una.id, otra.id] });

const presentar = async (cliente, enrollmentId, opcion) => {
  const curso = (await cliente.get(`/me/enrollments/${enrollmentId}`)).cuerpo;
  const pieza = (curso?.contents ?? curso?.version?.contents ?? []).find((c) => c.type === 'ASSESSMENT');
  const examenId = pieza?.assessmentId ?? pieza?.assessment?.id;
  const intento = await cliente.post(`/me/enrollments/${enrollmentId}/attempts?assessmentId=${examenId}`, {});
  if (!intento.ok) return intento;
  const attemptId = intento.cuerpo?.id ?? intento.cuerpo?.attempt?.id;
  const preguntas = intento.cuerpo?.questions ?? (await cliente.get(`/me/attempts/${attemptId}`)).cuerpo?.questions ?? [];
  for (const p of preguntas) {
    await cliente.post(`/me/attempts/${attemptId}/answers`, { attemptQuestionId: p.attemptQuestionId, answer: { optionId: opcion } });
  }
  return cliente.post(`/me/attempts/${attemptId}/submit`, {});
};

const sesiones = [];
for (const persona of [una, otra]) {
  const cliente = crearCliente();
  await cliente.entrar(persona.doc, persona.clave);
  const inscripcion = await cliente.post('/me/enroll', { offeringId: convocatoria.id });
  const enrollmentId = inscripcion.cuerpo?.enrollmentId ?? inscripcion.cuerpo?.id;
  const entrega = await presentar(cliente, enrollmentId, 'b');
  comprobar(entrega.ok && entrega.cuerpo?.passed === false, `${persona.doc}: reprueba su unico intento`, `${entrega.estado} ${JSON.stringify(entrega.cuerpo).slice(0, 160)}`);
  const otraVez = await presentar(cliente, enrollmentId, 'a');
  comprobar(!otraVez.ok && otraVez.cuerpo?.code === 'ENROLLMENT_BLOCKED', `${persona.doc}: queda BLOQUEADA, no puede presentar otra vez`, `${otraVez.estado} ${JSON.stringify(otraVez.cuerpo).slice(0, 160)}`);
  sesiones.push({ persona, cliente, enrollmentId });
}

paso(3, 'LA FICHA LA MUESTRA BLOQUEADA');
const filaDe = async (uid) => ((await admin.get(`/assignments?targetId=${id}&userId=${uid}`)).cuerpo?.items ?? [])[0];
const fila = await filaDe(una.id);
comprobar(fila?.bloqueada?.enrollmentId === sesiones[0].enrollmentId, 'su fila trae la inscripcion bloqueada', JSON.stringify(fila?.bloqueada));

paso(4, 'DAR UN INTENTO MAS: exige motivo');
const sinMotivo = await admin.post(`/enrollments/${sesiones[0].enrollmentId}/intento-extra`, { motivo: 'corto' });
comprobar(sinMotivo.estado === 400, 'sin un motivo de verdad, 400', `${sinMotivo.estado}`);
const sinPermiso = await sesiones[1].cliente.post(`/enrollments/${sesiones[0].enrollmentId}/intento-extra`, { motivo: 'me lo doy yo mismo, por favor' });
comprobar(sinPermiso.estado === 403, 'sin el permiso, 403', `${sinPermiso.estado}`);
const dado = await admin.post(`/enrollments/${sesiones[0].enrollmentId}/intento-extra`, { motivo: 'Reforzo el tema con su jefe (recorrido)' });
comprobar(dado.ok && dado.cuerpo?.extraAttempts === 1, 'concedido: un intento de mas', `${dado.estado} ${JSON.stringify(dado.cuerpo)}`);

paso(5, 'A ESA PERSONA: desbloqueada, y puede presentar y aprobar');
comprobar(!(await filaDe(una.id))?.bloqueada, 'su fila ya no sale bloqueada');
const segunda = await presentar(sesiones[0].cliente, sesiones[0].enrollmentId, 'a');
comprobar(segunda.ok && segunda.cuerpo?.passed === true, 'presenta su intento extra y aprueba', `${segunda.estado} ${JSON.stringify(segunda.cuerpo).slice(0, 160)}`);
const tercera = await presentar(sesiones[0].cliente, sesiones[0].enrollmentId, 'a');
comprobar(!tercera.ok, 'y no tiene un tercero: el extra es uno', `${tercera.estado}`);

paso(6, 'A LA OTRA PERSONA: nada cambio');
comprobar(!!(await filaDe(otra.id))?.bloqueada, 'sigue bloqueada');
const intentoOtra = await presentar(sesiones[1].cliente, sesiones[1].enrollmentId, 'a');
comprobar(!intentoOtra.ok && intentoOtra.cuerpo?.code === 'ENROLLMENT_BLOCKED', 'y no puede presentar', `${intentoOtra.estado}`);

console.log(`\nCREADO PARA LIMPIAR: actividad=${id} personas=${una.id},${otra.id} sufijo=${SUFIJO}`);
process.exit(resumen() === 0 ? 0 : 1);
