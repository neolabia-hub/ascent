// RECORRIDO: DESACTIVAR UNA FORMACION (2026-09-30), como el «ocultar» de Moodle.
//
// Desactivada = nadie NUEVO la recibe: ni a mano, ni por una regla. Quien ya la tiene la termina.
// Antes el flag no frenaba nada. Y la papelera es otra cosa: lo creado por error.
//
//   node scripts/recorridos/desactivar.mjs
import { crearCliente, paso, comprobar, resumen } from './api.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;
const sesion = await admin.entrar('admin@transprensa.com', 'Transprensa2026*');
const yo = sesion.user.id;

const procesos = (await admin.get('/catalogs/processes')).cuerpo ?? [];
const cargos = (await admin.get('/catalogs/job-titles')).cuerpo ?? [];
const proceso = procesos.find((p) => p.active) ?? procesos[0];

paso(1, 'UNA FORMACION PUBLICADA, Y UNA PERSONA QUE YA LA TIENE');
const tipo = await admin.post('/catalogs/activity-types', {
  code: `DSC_${marca}`,
  name: `Tipo desactivar ${SUFIJO}`,
  config: { requiresAssessment: false, requiresSurvey: false, issuesCertificate: false, defaultOfferingKind: 'PERMANENT', defaultAssignmentMode: 'MANUAL' },
});
const ficha = await admin.post('/activities', {
  code: `DSC_${SUFIJO}`,
  name: `Desactivar ${SUFIJO}`,
  activityTypeId: tipo.cuerpo.id,
  processId: proceso.id,
  modality: 'VIRTUAL',
});
const id = ficha.cuerpo.id;
const version = (await admin.get(`/activities/${id}`)).cuerpo.versions.find((v) => v.status === 'DRAFT').id;
const leccion = await admin.post('/lessons', { title: `Leccion ${SUFIJO}`, estimatedMinutes: 3 });
await admin.pedir(`/lessons/${leccion.cuerpo.id}/cards`, {
  method: 'PUT',
  body: JSON.stringify({ cards: [{ payload: { cardType: 'TEXT_IMAGE', title: 'Hola', body: 'Prueba.' } }] }),
});
await admin.post(`/activities/versions/${version}/contents`, {
  type: 'LESSON', title: 'Leccion', isRequired: true, config: { minSeconds: 1 }, lessonId: leccion.cuerpo.id,
});
await admin.post(`/activities/versions/${version}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
const previa = await admin.post('/assignments', { targetType: 'ACTIVITY', targetId: id, userIds: [yo] });
comprobar(previa.cuerpo?.created === 1, 'una persona la tiene pendiente', JSON.stringify(previa.cuerpo));

paso(2, 'DESACTIVADA: nadie nuevo la recibe');
const apaga = await admin.patch(`/activities/${id}`, { active: false });
comprobar(apaga.ok, 'desactivada', `${apaga.estado}`);
const aMano = await admin.post('/assignments', { targetType: 'ACTIVITY', targetId: id, jobTitleIds: [cargos[0].id] });
comprobar(aMano.estado === 409 && aMano.cuerpo?.code === 'ACTIVITY_INACTIVE', 'asignarla a mano: 409, y dice por que', `${aMano.estado} ${aMano.cuerpo?.code}`);
const vacio = { match: 'ALL', jobTitleIds: [cargos[0].id], jobTitleTypeIds: [], areaIds: [], regionalIds: [], serviceIds: [], employmentTypes: [], roadActors: [] };
const regla = await admin.post(`/activities/${id}/requirements`, { scope: vacio, trigger: 'ON_JOIN', dueDaysAfterTrigger: 30 });
comprobar(regla.ok && regla.cuerpo?.created === 0, 'una regla nueva no reparte obligaciones mientras este desactivada', `${regla.estado} ${JSON.stringify(regla.cuerpo)}`);

paso(3, 'QUIEN YA LA TENIA, LA CONSERVA');
const suya = ((await admin.get(`/assignments?targetId=${id}&userId=${yo}`)).cuerpo?.items ?? []).filter((a) => a.status === 'PENDING');
comprobar(suya.length === 1, 'su obligacion sigue pendiente: la puede terminar', `${suya.length}`);

paso(4, 'ACTIVADA DE NUEVO: vuelve a funcionar');
await admin.patch(`/activities/${id}`, { active: true });
const otraVez = await admin.post('/assignments', { targetType: 'ACTIVITY', targetId: id, jobTitleIds: [cargos[0].id] });
comprobar(otraVez.ok, 'se puede asignar otra vez', `${otraVez.estado} ${JSON.stringify(otraVez.cuerpo)?.slice(0, 120)}`);

// Limpieza: la regla y lo asignado quedan en una formacion de prueba; se desactiva el tipo.
await admin.patch(`/activities/${id}`, { active: false });
await admin.patch(`/catalogs/activity-types/${tipo.cuerpo.id}`, { active: false });

process.exit(resumen() === 0 ? 0 : 1);
