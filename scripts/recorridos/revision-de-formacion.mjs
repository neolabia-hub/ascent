// RECORRIDO: EL TRASPASO ENTRE QUIEN HACE LA FORMACION Y QUIEN LA APRUEBA.
//
// ─── LO QUE LO ORIGINA ───
//
// El cliente: *"cuando ellos terminen de crear toda su formacion del plan, un boton de enviar
// aprobacion para que el admin la revise y la apruebe"*.
//
// La compuerta ya existia —el analista no puede publicar— pero **no habia traspaso**: terminaba su
// formacion y nadie se enteraba. Esto prueba el camino entero con DOS cuentas de verdad, una de
// analista y una de administrador, porque la mitad de lo que hay que comprobar es justamente que
// cada una puede lo suyo y no lo de la otra.
//
//   node scripts/recorridos/revision-de-formacion.mjs
import { crearCliente, paso, ok, mal, comprobar, resumen } from './api.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(1, 'MONTAJE: un analista de verdad, y una formacion suya en borrador');

const cargos = ((await admin.get('/catalogs/job-titles')).cuerpo ?? []).filter((c) => c.active);
const areas = ((await admin.get('/catalogs/areas')).cuerpo ?? []).filter((a) => a.active);
const procesos = (await admin.get('/catalogs/processes')).cuerpo ?? [];
const proceso = procesos.find((p) => p.active) ?? procesos[0];
const tipos = (await admin.get('/catalogs/activity-types')).cuerpo ?? [];
// Una PILDORA: es la que menos promete (sin examen ni encuesta), asi que la compuerta del tipo no
// estorba a lo que se quiere probar aqui, que es la revision.
const tipo = tipos.find((t) => t.code === 'MICROLEARNING') ?? tipos[0];

const docAnalista = `RV${marca}1`;
const altaAnalista = await admin.post('/users', {
  documentNumber: docAnalista,
  fullName: `Analista de revision ${SUFIJO}`,
  email: `rv${marca}1@recorrido.test`,
  jobTitleId: cargos[0].id,
  areaId: areas[0].id,
  roleCode: 'ANALISTA',
});
comprobar(altaAnalista.ok, 'se crea una persona con rol ANALISTA', `alta: ${altaAnalista.estado} ${JSON.stringify(altaAnalista.cuerpo).slice(0, 200)}`);
const claveAnalista = altaAnalista.cuerpo?.generatedPassword ?? altaAnalista.cuerpo?.password;
if (!claveAnalista) { resumen(); process.exit(1); }

const analista = crearCliente();
await analista.entrar(docAnalista, claveAnalista);
ok('y entra con su cuenta');

// La formacion la crea EL ANALISTA, que es de lo que va todo esto.
const ficha = await analista.post('/activities', {
  code: `REV_${SUFIJO}`,
  name: `Formacion en revision ${SUFIJO}`,
  description: 'Recorrido del traspaso analista → administrador.',
  activityTypeId: tipo.id,
  processId: proceso.id,
  modality: 'VIRTUAL',
});
comprobar(ficha.ok, 'el analista puede CREAR la formacion', `crear: ${ficha.estado} ${JSON.stringify(ficha.cuerpo).slice(0, 200)}`);
const activityId = ficha.cuerpo?.id;
if (!activityId) { resumen(); process.exit(1); }
const versionId = ((await analista.get(`/activities/${activityId}`)).cuerpo?.versions ?? []).find((v) => v.status === 'DRAFT')?.id;

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(2, 'SIN CONTENIDO NO SE MANDA: la misma compuerta que publicar');

/*
  Si «enviar a revision» fuera mas permisivo que publicar, el administrador recibiria formaciones
  que no se pueden publicar y lo descubriria al intentarlo, con quien las mando ya en otra cosa.
*/
const vacia = await analista.post(`/activities/versions/${versionId}/enviar-a-revision`, {});
comprobar(
  vacia.estado === 400 && vacia.cuerpo?.code === 'VERSION_EMPTY',
  'una version sin contenidos se rechaza con VERSION_EMPTY',
  `esperaba 400 VERSION_EMPTY y llego ${vacia.estado} ${vacia.cuerpo?.code}`,
);

const leccion = await analista.post('/lessons', { title: `Contenido ${SUFIJO}`, estimatedMinutes: 5 });
await analista.pedir(`/lessons/${leccion.cuerpo.id}/cards`, {
  method: 'PUT',
  body: JSON.stringify({ cards: [{ payload: { cardType: 'TEXT_IMAGE', title: 'Uno', body: 'Contenido.' } }] }),
});
await analista.post(`/activities/versions/${versionId}/contents`, {
  type: 'LESSON', title: 'Contenido', isRequired: true, config: { minSeconds: 1 }, lessonId: leccion.cuerpo.id,
});
ok('se le agrega una leccion');

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(3, 'EL ANALISTA NO PUEDE APROBAR LO SUYO');

const autoAprobar = await analista.post(`/activities/versions/${versionId}/aprobar-revision`, {});
comprobar(
  autoAprobar.estado === 403,
  'aprobar le devuelve 403: no tiene `catalog:publish`',
  `esperaba 403 y llego ${autoAprobar.estado}`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(4, 'LA ENVIA A REVISION, y el administrador se entera');

const enviada = await analista.post(`/activities/versions/${versionId}/enviar-a-revision`, {});
comprobar(enviada.ok && enviada.cuerpo?.reviewStatus === 'EN_REVISION', 'queda EN_REVISION', `envio: ${enviada.estado} ${JSON.stringify(enviada.cuerpo).slice(0, 200)}`);

const bandeja = (await admin.get('/notifications')).cuerpo?.items ?? [];
comprobar(
  bandeja.some((n) => (n.subject ?? '').includes(`Formacion en revision ${SUFIJO}`) || (n.subject ?? '').includes(SUFIJO)),
  'y al administrador le llega el aviso a su bandeja',
  `no hay aviso con el sufijo ${SUFIJO} entre los ${bandeja.length} de la bandeja`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(5, 'MIENTRAS ESTA EN REVISION, NO SE TOCA');

/*
  Sin esto el traspaso no seria tal: quien la mando podria seguir cambiandola mientras el
  administrador la lee, y lo aprobado no seria lo revisado.
*/
const editar = await analista.post(`/activities/versions/${versionId}/contents`, {
  type: 'LESSON', title: 'Colado', isRequired: true, config: { minSeconds: 1 }, lessonId: leccion.cuerpo.id,
});
comprobar(
  editar.estado === 409 && editar.cuerpo?.code === 'VERSION_EN_REVISION',
  'agregar contenido se rechaza con VERSION_EN_REVISION',
  `esperaba 409 VERSION_EN_REVISION y llego ${editar.estado} ${editar.cuerpo?.code}`,
);

const reenviar = await analista.post(`/activities/versions/${versionId}/enviar-a-revision`, {});
comprobar(
  reenviar.estado === 409 && reenviar.cuerpo?.code === 'YA_EN_REVISION',
  'y volver a enviarla tampoco: ya esta esperando',
  `esperaba 409 YA_EN_REVISION y llego ${reenviar.estado} ${reenviar.cuerpo?.code}`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(6, 'EL ADMINISTRADOR LA DEVUELVE, y el motivo es obligatorio');

const sinMotivo = await admin.post(`/activities/versions/${versionId}/devolver-revision`, { motivo: 'no' });
comprobar(
  sinMotivo.estado === 400 || sinMotivo.estado === 422,
  'devolver sin un motivo de verdad se rechaza',
  `esperaba 400/422 y llego ${sinMotivo.estado}`,
);

const devuelta = await admin.post(`/activities/versions/${versionId}/devolver-revision`, {
  motivo: 'Falta la evaluacion final y el temario esta incompleto',
});
comprobar(devuelta.ok && devuelta.cuerpo?.reviewStatus === 'DEVUELTA', 'con motivo, queda DEVUELTA', `devolver: ${devuelta.estado} ${JSON.stringify(devuelta.cuerpo).slice(0, 200)}`);
comprobar(
  (devuelta.cuerpo?.reviewNote ?? '').includes('evaluacion final'),
  'y el motivo queda guardado, para que quien la hizo sepa que corregir',
  `la nota es: ${devuelta.cuerpo?.reviewNote}`,
);

const suBandeja = (await analista.get('/notifications')).cuerpo?.items ?? [];
comprobar(
  suBandeja.some((n) => (n.body ?? '').includes('evaluacion final')),
  'al analista le llega el aviso CON el motivo dentro',
  `no llego: ${suBandeja.length} avisos en su bandeja`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(7, 'DEVUELTA VUELVE A SER EDITABLE');

const editarTrasDevolver = await analista.post(`/activities/versions/${versionId}/contents`, {
  type: 'LESSON', title: 'Corregido', isRequired: true, config: { minSeconds: 1 }, lessonId: leccion.cuerpo.id,
});
comprobar(editarTrasDevolver.ok, 'el analista puede corregirla', `editar: ${editarTrasDevolver.estado} ${JSON.stringify(editarTrasDevolver.cuerpo).slice(0, 200)}`);

const segundoEnvio = await analista.post(`/activities/versions/${versionId}/enviar-a-revision`, {});
comprobar(segundoEnvio.ok && segundoEnvio.cuerpo?.reviewStatus === 'EN_REVISION', 'y volver a enviarla', `reenvio: ${segundoEnvio.estado}`);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(8, 'EL ADMINISTRADOR LA APRUEBA — y aprobar NO publica');

const aprobada = await admin.post(`/activities/versions/${versionId}/aprobar-revision`, {});
comprobar(aprobada.ok && aprobada.cuerpo?.reviewStatus === 'APROBADA', 'queda APROBADA', `aprobar: ${aprobada.estado} ${JSON.stringify(aprobada.cuerpo).slice(0, 200)}`);

const trasAprobar = (await admin.get(`/activities/${activityId}`)).cuerpo;
const versionTrasAprobar = (trasAprobar?.versions ?? []).find((v) => v.id === versionId);
comprobar(
  versionTrasAprobar?.status === 'DRAFT',
  'y la version SIGUE EN BORRADOR: aprobar y publicar son dos actos distintos',
  `el estado es ${versionTrasAprobar?.status}`,
);

const avisoAprobada = ((await analista.get('/notifications')).cuerpo?.items ?? []).some((n) =>
  (n.subject ?? '').startsWith('Aprobada:'),
);
comprobar(avisoAprobada, 'al analista le llega que se la aprobaron', 'no llego el aviso de aprobada');

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(9, 'TOCAR UNA APROBADA LA DESAPRUEBA');

/*
  Sin esto, «aprobada» acabaria significando «aprobada hace tres versiones»: se aprueba, se le
  cambia el examen entero, y sigue diciendo que alguien la reviso.
*/
await analista.post(`/activities/versions/${versionId}/contents`, {
  type: 'LESSON', title: 'Cambio posterior', isRequired: true, config: { minSeconds: 1 }, lessonId: leccion.cuerpo.id,
});
const trasTocar = (await admin.get(`/activities/${activityId}`)).cuerpo;
const versionTrasTocar = (trasTocar?.versions ?? []).find((v) => v.id === versionId);
comprobar(
  versionTrasTocar?.reviewStatus === 'SIN_ENVIAR',
  'editarla despues de aprobada le quita el sello',
  `el estado de revision quedo en ${versionTrasTocar?.reviewStatus}`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(10, 'Y EL ANALISTA SIGUE SIN PODER PUBLICAR');

const publicar = await analista.post(`/activities/versions/${versionId}/publish`, {
  migrationPolicy: 'MOVE_NOT_STARTED', confirm: true, justification: 'Intento del recorrido',
});
comprobar(
  publicar.ok && publicar.cuerpo?.executed === false,
  'publicar no ejecuta: se queda en solicitud de aprobacion',
  `publicar devolvio ${publicar.estado} executed=${publicar.cuerpo?.executed}`,
);

const finalmente = (await admin.get(`/activities/${activityId}`)).cuerpo;
const versionFinal = (finalmente?.versions ?? []).find((v) => v.id === versionId);
comprobar(versionFinal?.status === 'DRAFT', 'y la version sigue sin publicar', `estado ${versionFinal?.status}`);

console.log(`\nCreado con sufijo ${SUFIJO}: 1 formacion, 1 persona (analista).`);
process.exit(resumen() === 0 ? 0 : 1);
