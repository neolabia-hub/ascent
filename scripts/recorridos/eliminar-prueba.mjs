// RECORRIDO: ELIMINAR UNA FORMACION DE PRUEBA QUE YA SE USO (2026-09-30).
//
// Nace de «videos3» en produccion: una induccion de prueba con convocatoria y constancias que el
// borrado normal —con razon— no dejaba quitar. Como en los LMS, el administrador del SITIO puede
// mandarla a la papelera; aqui ese poder es un permiso INDIVIDUAL (`catalog:force_delete`) que no
// tiene ningun rol, tampoco ADMIN.
//
// Se comprueba que: sin el permiso, 403; el borrado normal sigue negandose; un nombre mal escrito o
// un motivo corto se rechazan; y el camino bueno la manda a la papelera sin borrar nada.
//
// Requiere haber corrido `dev:sincronizar-permisos -- --si` (crea el permiso sin darselo a nadie).
//
//   node scripts/recorridos/eliminar-prueba.mjs
import { crearCliente, paso, ok, mal, comprobar, resumen } from './api.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;
const sesion = await admin.entrar('admin@transprensa.com', 'Transprensa2026*');
const yo = sesion.user.id;

const procesos = (await admin.get('/catalogs/processes')).cuerpo ?? [];

// LAS METRICAS DE SEGUIMIENTO, para comparar: la papelera no puede moverlas.
const metricas = async () => JSON.stringify((await admin.get('/reportes/analitica')).cuerpo?.resumen ?? null);
const M0 = await metricas();
const proceso = procesos.find((p) => p.active) ?? procesos[0];

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(1, 'UNA FORMACION DE PRUEBA, PUBLICADA Y CON CONVOCATORIA');
const tipo = await admin.post('/catalogs/activity-types', {
  code: `ELP_${marca}`,
  name: `Tipo eliminar ${SUFIJO}`,
  config: { requiresAssessment: false, requiresSurvey: false, issuesCertificate: false, defaultOfferingKind: 'PERMANENT', defaultAssignmentMode: 'MANUAL' },
});
const ficha = await admin.post('/activities', {
  code: `ELP_${SUFIJO}`,
  name: `Formacion de prueba ${SUFIJO}`,
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
const publica = await admin.post(`/activities/versions/${version}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
comprobar(publica.ok, 'publicada', `${publica.estado} ${JSON.stringify(publica.cuerpo)}`);
const convocatorias = ((await admin.get(`/offerings?activityId=${id}`)).cuerpo?.items ?? []).length;
comprobar(convocatorias >= 1, `tiene ${convocatorias} convocatoria(s)`, 'no se abrio ninguna convocatoria');
const suelta = await admin.post('/assignments', { targetType: 'ACTIVITY', targetId: id, userIds: [yo] });
comprobar(suelta.cuerpo?.created === 1, 'y una obligacion pendiente', JSON.stringify(suelta.cuerpo));
const M1 = await metricas();
comprobar(M1 !== M0, 'y Seguimiento la cuenta (las metricas se movieron)', M1);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(2, 'EL BORRADO NORMAL SIGUE NEGANDOSE, y sin el permiso individual no hay otro camino');
const normal = await admin.pedir(`/activities/${id}`, { method: 'DELETE' });
comprobar(normal.estado === 409 && normal.cuerpo?.code === 'ACTIVITY_IN_USE', 'borrar: 409 en uso', `${normal.estado} ${normal.cuerpo?.code}`);
const cuerpoBueno = { confirmacion: `Formacion de prueba ${SUFIJO}`, motivo: 'Formacion de prueba del recorrido automatico' };
const sinPermiso = await admin.post(`/activities/${id}/eliminar-prueba`, cuerpoBueno);
comprobar(sinPermiso.estado === 403, 'ADMIN sin el permiso individual: 403', `${sinPermiso.estado}`);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(3, 'SE CONCEDE A UNA PERSONA, sin tocar lo que ya tuviera');
const antes = (await admin.get(`/users/${yo}`)).cuerpo?.overrides ?? [];
const previos = antes.map((o) => ({ permissionCode: o.permission.code, granted: o.granted }));
const concede = await admin.post(`/users/${yo}/overrides`, {
  overrides: [...previos.filter((o) => o.permissionCode !== 'catalog:force_delete'), { permissionCode: 'catalog:force_delete', granted: true }],
});
comprobar(concede.ok, 'permiso concedido', `${concede.estado} ${JSON.stringify(concede.cuerpo)}`);
const miPerfil = (await admin.get('/auth/me')).cuerpo;
comprobar(
  miPerfil?.permissions?.includes('catalog:force_delete'),
  '/auth/me ya lo trae (los permisos EFECTIVOS, no solo los del rol)',
  `permisos: ${miPerfil?.permissions?.length}`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(4, 'LOS DOS SEGUROS: el nombre exacto y un motivo de verdad');
const malNombre = await admin.post(`/activities/${id}/eliminar-prueba`, { ...cuerpoBueno, confirmacion: 'otra cosa' });
comprobar(malNombre.estado === 400 && malNombre.cuerpo?.code === 'CONFIRMATION_MISMATCH', 'nombre mal escrito: 400', `${malNombre.estado}`);
const corto = await admin.post(`/activities/${id}/eliminar-prueba`, { ...cuerpoBueno, motivo: 'error' });
comprobar(corto.estado === 422, 'motivo corto: 422', `${corto.estado}`);
const sinTildes = await admin.post(`/activities/${id}/eliminar-prueba`, {
  ...cuerpoBueno,
  confirmacion: `  FORMACIÓN de prueba ${SUFIJO} `,
});
comprobar(sinTildes.ok, 'el nombre se compara sin mayusculas, tildes ni espacios de mas', `${sinTildes.estado} ${JSON.stringify(sinTildes.cuerpo)}`);
comprobar(
  sinTildes.cuerpo?.obligacionesEximidas === 1 && sinTildes.cuerpo?.convocatoriasCanceladas >= 1,
  'eximio lo pendiente y cancelo la convocatoria',
  JSON.stringify(sinTildes.cuerpo),
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(5, 'YA NO APARECE, y nada se borro');
const buscada = await admin.get(`/activities/${id}`);
comprobar(buscada.estado === 404, 'la ficha da 404 (esta en la papelera)', `${buscada.estado}`);
const pendientes = ((await admin.get('/me/pending')).cuerpo?.items ?? []).filter((p) => p.activityId === id);
comprobar(pendientes.length === 0, 'y no sale en los pendientes de nadie', `sigue en ${pendientes.length}`);
const obligaciones = (await admin.get(`/assignments?targetId=${id}&userId=${yo}`)).cuerpo?.items ?? [];
comprobar(obligaciones.length === 1 && obligaciones[0].status === 'WAIVED', 'la obligacion sigue en la base, eximida', JSON.stringify(obligaciones.map((o) => o.status)));

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso('5 bis', 'EN LA PAPELERA NO CUENTA EN SEGUIMIENTO, y se lista en la papelera');
const M2 = await metricas();
comprobar(M2 === M0, 'las metricas vuelven EXACTAMENTE a las de antes de crearla', `antes=${M0} ahora=${M2}`);
const enPapelera = (await admin.get('/activities/papelera')).cuerpo ?? [];
const fila = enPapelera.find((f) => f.id === id);
comprobar(!!fila && fila.motivo === cuerpoBueno.motivo, 'la papelera la lista con su motivo', JSON.stringify(fila));
const listaAsign = (await admin.get(`/assignments?userId=${yo}`)).cuerpo?.items ?? [];
comprobar(!listaAsign.some((a) => a.targetId === id), 'y no sale en la lista de obligaciones de la persona');

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso('5 ter', 'RESTAURAR: vuelve TAL COMO ESTABA');
const vuelve = await admin.post(`/activities/${id}/restaurar`, {});
comprobar(vuelve.ok && vuelve.cuerpo?.obligaciones === 1, 'restaurada, con su obligacion', `${vuelve.estado} ${JSON.stringify(vuelve.cuerpo)}`);
comprobar(vuelve.cuerpo?.convocatorias >= 1, 'y su convocatoria', JSON.stringify(vuelve.cuerpo));
const ficha2 = await admin.get(`/activities/${id}`);
comprobar(ficha2.ok, 'la ficha vuelve a abrir', `${ficha2.estado}`);
const ob2 = (await admin.get(`/assignments?targetId=${id}&userId=${yo}`)).cuerpo?.items ?? [];
comprobar(ob2.length === 1 && ob2[0].status === 'PENDING', 'la obligacion vuelve a PENDIENTE', JSON.stringify(ob2.map((o) => o.status)));
const conv2 = ((await admin.get(`/offerings?activityId=${id}`)).cuerpo?.items ?? []).filter((o) => o.status === 'PUBLISHED');
comprobar(conv2.length >= 1, 'la convocatoria vuelve a PUBLICADA', `publicadas=${conv2.length}`);
const pend2 = ((await admin.get('/me/pending')).cuerpo?.items ?? []).filter((p) => p.activityId === id);
comprobar(pend2.length === 1, 'y la persona la vuelve a ver en sus pendientes', `${pend2.length}`);
const M3 = await metricas();
comprobar(M3 === M1, 'y Seguimiento la vuelve a contar igual que antes de borrarla', `antes=${M1} ahora=${M3}`);
const sale = ((await admin.get('/activities/papelera')).cuerpo ?? []).some((f) => f.id === id);
comprobar(!sale, 'ya no esta en la papelera');
const otraVez = await admin.post(`/activities/${id}/restaurar`, {});
comprobar(otraVez.estado === 404, 'restaurar algo que no esta en la papelera: 404', `${otraVez.estado}`);

// Se vuelve a eliminar al terminar: es una formacion de prueba.
await admin.post(`/activities/${id}/eliminar-prueba`, cuerpoBueno);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(6, 'LIMPIEZA: se retira el permiso y se desactiva el tipo');
const retira = await admin.post(`/users/${yo}/overrides`, { overrides: previos });
comprobar(retira.ok, 'permiso retirado, quedan los que habia', `${retira.estado}`);
await admin.patch(`/catalogs/activity-types/${tipo.cuerpo.id}`, { active: false });
ok('tipo desactivado');

process.exit(resumen() === 0 ? 0 : 1);
