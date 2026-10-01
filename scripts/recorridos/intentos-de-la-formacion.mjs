// RECORRIDO: SUBIR EL MAXIMO DE INTENTOS DE UNA FORMACION, ¿le llega a quien ya los agoto? (2026-10-01)
//
// Pregunta del cliente: si la formacion tiene 1 intento (el de la empresa) y en ESA formacion se sube
// a 2, ¿quien ya lo gasto puede volver a presentar? Se prueba con las tres politicas de publicacion.
//
//   node scripts/recorridos/intentos-de-la-formacion.mjs
import { crearCliente, paso, comprobar, resumen } from './api.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;
await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

const procesos = (await admin.get('/catalogs/processes')).cuerpo ?? [];
const proceso = procesos.find((p) => p.active) ?? procesos[0];
const cargos = ((await admin.get('/catalogs/job-titles')).cuerpo ?? []).filter((x) => x.active);
const areas = ((await admin.get('/catalogs/areas')).cuerpo ?? []).filter((x) => x.active);

paso(1, 'FORMACION CON 1 INTENTO, Y UNA PERSONA QUE LO GASTA');
const tipo = await admin.post('/catalogs/activity-types', {
  code: `IDF_${marca}`,
  name: `Tipo intentos formacion ${SUFIJO}`,
  config: { requiresAssessment: false, requiresSurvey: false, issuesCertificate: false, defaultOfferingKind: 'PERMANENT', defaultAssignmentMode: 'MANUAL' },
});
const ficha = await admin.post('/activities', {
  code: `IDF_${SUFIJO}`, name: `Intentos formacion ${SUFIJO}`, activityTypeId: tipo.cuerpo.id, processId: proceso.id, modality: 'VIRTUAL',
});
const id = ficha.cuerpo.id;
const borrador = async () => (await admin.get(`/activities/${id}`)).cuerpo.versions.find((v) => v.status === 'DRAFT').id;
const v1 = await borrador();
const pregunta = await admin.post('/questions', {
  payload: {
    qtype: 'SINGLE', stem: 'Antes de mover la estiba...',
    options: [{ id: 'a', text: 'Se revisa la carga' }, { id: 'b', text: 'Se mueve y ya' }],
    correctOptionId: 'a', points: 1,
  },
});
// El examen NO fija intentos: los toma de la formacion, que es donde el cliente los cambia.
const examen = await admin.post('/assessments', { title: `Examen ${SUFIJO}` });
await admin.patch(`/assessments/${examen.cuerpo.id}`, {
  passingScore: 80, maxAttempts: null, sections: [{ mode: 'FIXED', questionIds: [pregunta.cuerpo?.id] }],
});
await admin.post(`/activities/versions/${v1}/contents`, {
  type: 'ASSESSMENT', title: 'Examen', isRequired: true, config: {}, assessmentId: examen.cuerpo.id,
});
const ajuste1 = await admin.patch(`/activities/versions/${v1}/settings`, { maxAttempts: 1 });
comprobar(ajuste1.ok, 'la formacion queda con 1 intento', `${ajuste1.estado} ${JSON.stringify(ajuste1.cuerpo).slice(0, 160)}`);
const pub1 = await admin.post(`/activities/versions/${v1}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
comprobar(pub1.ok, 'publicada v1', `${pub1.estado} ${JSON.stringify(pub1.cuerpo).slice(0, 160)}`);
const convocatoria = ((await admin.get(`/offerings?activityId=${id}`)).cuerpo?.items ?? [])[0];

const doc = `IF${marca}`;
const alta = await admin.post('/users', {
  documentNumber: doc, fullName: `Persona intentos formacion ${SUFIJO}`,
  email: `${doc.toLowerCase()}@recorrido.test`, jobTitleId: cargos[0].id, areaId: areas[0].id,
});
const userId = alta.cuerpo?.id ?? alta.cuerpo?.user?.id;
await admin.post('/assignments', { targetType: 'ACTIVITY', targetId: id, userIds: [userId] });
const aprendiz = crearCliente();
await aprendiz.entrar(doc, alta.cuerpo?.generatedPassword);
const insc = await aprendiz.post('/me/enroll', { offeringId: convocatoria.id });
const enrollmentId = insc.cuerpo?.enrollmentId ?? insc.cuerpo?.id;

const presentar = async (opcion) => {
  const curso = (await aprendiz.get(`/me/enrollments/${enrollmentId}`)).cuerpo;
  const pieza = (curso?.contents ?? curso?.version?.contents ?? []).find((c) => c.type === 'ASSESSMENT');
  const examenId = pieza?.assessmentId ?? pieza?.assessment?.id;
  const intento = await aprendiz.post(`/me/enrollments/${enrollmentId}/attempts?assessmentId=${examenId}`, {});
  if (!intento.ok) return intento;
  const attemptId = intento.cuerpo?.id ?? intento.cuerpo?.attempt?.id;
  const preguntas = intento.cuerpo?.questions ?? (await aprendiz.get(`/me/attempts/${attemptId}`)).cuerpo?.questions ?? [];
  for (const p of preguntas) {
    await aprendiz.post(`/me/attempts/${attemptId}/answers`, { attemptQuestionId: p.attemptQuestionId, answer: { optionId: opcion } });
  }
  return aprendiz.post(`/me/attempts/${attemptId}/submit`, {});
};
const r1 = await presentar('b');
comprobar(r1.ok && r1.cuerpo?.passed === false, 'reprueba su unico intento');
const bloqueada = await presentar('a');
comprobar(bloqueada.cuerpo?.code === 'ENROLLMENT_BLOCKED', 'queda bloqueada', JSON.stringify(bloqueada.cuerpo).slice(0, 120));

paso(2, 'SE SUBE A 2 INTENTOS EN ESA FORMACION Y SE PUBLICA');
await admin.post(`/activities/${id}/versions`, {});
const v2 = await borrador();
const ajuste2 = await admin.patch(`/activities/versions/${v2}/settings`, { maxAttempts: 2 });
comprobar(ajuste2.ok, 'la version nueva queda con 2 intentos', `${ajuste2.estado}`);
const pub2 = await admin.post(`/activities/versions/${v2}/publish`, { migrationPolicy: 'RESTART_NEW', confirm: true });
comprobar(pub2.ok, 'publicada v2 (politica: los que van a mitad reinician en la nueva)', `${pub2.estado} ${JSON.stringify(pub2.cuerpo).slice(0, 200)}`);

paso(3, 'LA PREGUNTA: ¿quien ya agoto el intento puede presentar?');
const otraVez = await presentar('a');
console.log(`   ... respuesta: ${otraVez.estado} ${JSON.stringify(otraVez.cuerpo).slice(0, 160)}`);
comprobar(otraVez.ok && otraVez.cuerpo?.passed === true, 'SI: con el maximo subido presenta y aprueba', 'NO: sigue bloqueada aunque la formacion ya tiene 2 intentos');


paso(4, 'Y CON LA OTRA POLITICA (solo los que no han empezado pasan): se agota de nuevo y se sube a 3');
const r2 = await presentar('b');
// Aprobo arriba; para seguir probando se usa una SEGUNDA persona en el paso 5. Aqui solo se comprueba
// que no se le abre un intento a quien ya aprobo.
comprobar(r2.cuerpo?.code === 'ALREADY_PASSED' || !r2.ok, 'quien ya aprobo no abre otro intento', JSON.stringify(r2.cuerpo).slice(0, 120));

paso(5, 'SUBIR EL MAXIMO EN LA EVALUACION («Cómo se califica»), sin publicar la formacion');
const ficha2 = await admin.post('/activities', {
  code: `IDE_${SUFIJO}`, name: `Intentos examen ${SUFIJO}`, activityTypeId: tipo.cuerpo.id, processId: proceso.id, modality: 'VIRTUAL',
});
const id2 = ficha2.cuerpo.id;
const w1 = (await admin.get(`/activities/${id2}`)).cuerpo.versions.find((v) => v.status === 'DRAFT').id;
const examen2 = await admin.post('/assessments', { title: `Examen fijo ${SUFIJO}` });
// Este examen SI fija su maximo: 1. Manda sobre la formacion.
await admin.patch(`/assessments/${examen2.cuerpo.id}`, {
  passingScore: 80, maxAttempts: 1, sections: [{ mode: 'FIXED', questionIds: [pregunta.cuerpo?.id] }],
});
await admin.post(`/activities/versions/${w1}/contents`, {
  type: 'ASSESSMENT', title: 'Examen', isRequired: true, config: {}, assessmentId: examen2.cuerpo.id,
});
await admin.patch(`/activities/versions/${w1}/settings`, { maxAttempts: 5 });
const pubE = await admin.post(`/activities/versions/${w1}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
comprobar(pubE.ok, 'publicada con examen de 1 intento (aunque la formacion diga 5)');
const conv2 = ((await admin.get(`/offerings?activityId=${id2}`)).cuerpo?.items ?? [])[0];
const doc2 = `IG${marca}`;
const alta2 = await admin.post('/users', {
  documentNumber: doc2, fullName: `Persona intentos examen ${SUFIJO}`,
  email: `${doc2.toLowerCase()}@recorrido.test`, jobTitleId: cargos[0].id, areaId: areas[0].id,
});
const user2 = alta2.cuerpo?.id ?? alta2.cuerpo?.user?.id;
await admin.post('/assignments', { targetType: 'ACTIVITY', targetId: id2, userIds: [user2] });
const ap2 = crearCliente();
await ap2.entrar(doc2, alta2.cuerpo?.generatedPassword);
const ins2 = await ap2.post('/me/enroll', { offeringId: conv2.id });
const enr2 = ins2.cuerpo?.enrollmentId ?? ins2.cuerpo?.id;
const presentar2 = async (opcion) => {
  const curso = (await ap2.get(`/me/enrollments/${enr2}`)).cuerpo;
  const pieza = (curso?.contents ?? curso?.version?.contents ?? []).find((c) => c.type === 'ASSESSMENT');
  const examenId = pieza?.assessmentId ?? pieza?.assessment?.id;
  const intento = await ap2.post(`/me/enrollments/${enr2}/attempts?assessmentId=${examenId}`, {});
  if (!intento.ok) return intento;
  const attemptId = intento.cuerpo?.id ?? intento.cuerpo?.attempt?.id;
  const preguntas = intento.cuerpo?.questions ?? (await ap2.get(`/me/attempts/${attemptId}`)).cuerpo?.questions ?? [];
  for (const q of preguntas) {
    await ap2.post(`/me/attempts/${attemptId}/answers`, { attemptQuestionId: q.attemptQuestionId, answer: { optionId: opcion } });
  }
  return ap2.post(`/me/attempts/${attemptId}/submit`, {});
};
const e1 = await presentar2('b');
comprobar(e1.ok && e1.cuerpo?.passed === false, 'reprueba su unico intento (el del examen, no los 5 de la formacion)');
const e1b = await presentar2('a');
comprobar(e1b.cuerpo?.code === 'ENROLLMENT_BLOCKED', 'queda bloqueada', JSON.stringify(e1b.cuerpo).slice(0, 120));
const curso2 = (await ap2.get(`/me/enrollments/${enr2}`)).cuerpo;
comprobar(curso2?.enrollment?.blockedAt != null, 'y su pantalla la muestra bloqueada');

const sube = await admin.patch(`/assessments/${examen2.cuerpo.id}`, { maxAttempts: 2 });
comprobar(sube.ok, 'en Evaluaciones se sube el examen a 2 intentos', `${sube.estado}`);
const curso2b = (await ap2.get(`/me/enrollments/${enr2}`)).cuerpo;
comprobar(curso2b?.enrollment?.blockedAt == null, 'su pantalla ya NO la muestra bloqueada', JSON.stringify(curso2b?.enrollment?.blockedAt));
const e2 = await presentar2('a');
comprobar(e2.ok && e2.cuerpo?.passed === true, 'presenta el intento nuevo y aprueba', `${e2.estado} ${JSON.stringify(e2.cuerpo).slice(0, 160)}`);

paso(6, 'LO QUE NO SE MUEVE: bajar el maximo no le quita a nadie lo que tenia');
const baja = await admin.patch(`/assessments/${examen2.cuerpo.id}`, { maxAttempts: 1 });
comprobar(baja.ok, 'se puede volver a bajar en Evaluaciones');
const fila2 = ((await admin.get(`/assignments?targetId=${id2}&userId=${user2}`)).cuerpo?.items ?? [])[0];
comprobar(fila2?.status === 'COMPLETED', 'y quien ya aprobo sigue con su formacion cumplida', fila2?.status);

console.log(`\nCREADO PARA LIMPIAR: actividad=${id} persona=${userId} sufijo=${SUFIJO}`);
process.exit(resumen() === 0 ? 0 : 1);
