// RECORRIDO: CERRAR LA CONVOCATORIA PERMANENTE Y PUBLICAR OTRA VERSION (2026-10-01).
//
// Lo que paso en produccion con «Inducción Corporativa SST»: alguien cerro a mano su convocatoria
// permanente y las seis versiones que se publicaron despues no abrieron otra. Toda la gente salio
// «Esperando convocatoria» casi un dia. La apertura automatica contaba tambien las CERRADAS.
//
// Se comprueba que una cerrada ya no impide abrir otra, y que una ABIERTA si lo impide (no se
// duplican puertas).
//
//   node scripts/recorridos/reabrir-permanente.mjs
import { crearCliente, paso, comprobar, resumen } from './api.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;
await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

const procesos = (await admin.get('/catalogs/processes')).cuerpo ?? [];
const proceso = procesos.find((p) => p.active) ?? procesos[0];

paso(1, 'UN TIPO QUE SE ABRE SOLO, Y SU PRIMERA VERSION');
const tipo = await admin.post('/catalogs/activity-types', {
  code: `RAP_${marca}`,
  name: `Tipo reabrir ${SUFIJO}`,
  config: { requiresAssessment: false, requiresSurvey: false, issuesCertificate: false, defaultOfferingKind: 'PERMANENT', defaultAssignmentMode: 'MANUAL' },
});
const ficha = await admin.post('/activities', {
  code: `RAP_${SUFIJO}`, name: `Reabrir ${SUFIJO}`, activityTypeId: tipo.cuerpo.id, processId: proceso.id, modality: 'VIRTUAL',
});
const id = ficha.cuerpo.id;
const borrador = async () => (await admin.get(`/activities/${id}`)).cuerpo.versions.find((v) => v.status === 'DRAFT')?.id;
const leccion = await admin.post('/lessons', { title: `Leccion ${SUFIJO}`, estimatedMinutes: 3 });
await admin.pedir(`/lessons/${leccion.cuerpo.id}/cards`, {
  method: 'PUT',
  body: JSON.stringify({ cards: [{ payload: { cardType: 'TEXT_IMAGE', title: 'Hola', body: 'Prueba.' } }] }),
});
const v1 = await borrador();
await admin.post(`/activities/versions/${v1}/contents`, {
  type: 'LESSON', title: 'Leccion', isRequired: true, config: { minSeconds: 1 }, lessonId: leccion.cuerpo.id,
});
await admin.post(`/activities/versions/${v1}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
const abiertas = async () =>
  ((await admin.get(`/offerings?activityId=${id}`)).cuerpo?.items ?? []).filter((o) => ['PUBLISHED', 'IN_PROGRESS'].includes(o.status));
const primera = (await abiertas())[0];
comprobar(!!primera, 'al publicar se abre sola su convocatoria permanente');

paso(2, 'CON UNA ABIERTA, PUBLICAR OTRA VERSION NO DUPLICA LA PUERTA');
await admin.post(`/activities/${id}/versions`, {});
const v2 = await borrador();
await admin.post(`/activities/versions/${v2}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
comprobar((await abiertas()).length === 1, 'sigue habiendo UNA abierta', `hay ${(await abiertas()).length}`);

paso(3, 'SE CIERRA A MANO, Y SE PUBLICA OTRA VERSION');
const cerrar = await admin.post(`/offerings/${primera.id}/complete`, {});
comprobar(cerrar.ok, 'la convocatoria se cierra', `${cerrar.estado} ${JSON.stringify(cerrar.cuerpo).slice(0, 160)}`);
comprobar((await abiertas()).length === 0, 'y la formacion queda sin puerta');
await admin.post(`/activities/${id}/versions`, {});
const v3 = await borrador();
const pub3 = await admin.post(`/activities/versions/${v3}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
comprobar(pub3.ok, 'version 3 publicada');
const trasPublicar = await abiertas();
comprobar(
  trasPublicar.length === 1 && trasPublicar[0].id !== primera.id,
  'publicar abre una convocatoria NUEVA: nadie queda «Esperando convocatoria»',
  `abiertas: ${trasPublicar.length}`,
);

console.log(`\nCREADO PARA LIMPIAR: actividad=${id} sufijo=${SUFIJO}`);
process.exit(resumen() === 0 ? 0 : 1);
