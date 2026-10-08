// RECORRIDO: QUIEN VE QUE EN SEGUIMIENTO, INICIO Y ASIGNACIONES (2026-10-07).
//
// Pedido del cliente: "en Seguimiento a los analistas les salen todos los datos; solo debe salir lo
// que tengan asignado. Solo por permiso pueden ver todo". Era cierto: las rutas pedian
// `reports:read_scope` —«los informes de mi alcance»— y ninguna aplicaba alcance.
//
// Lo que se comprueba, con un analista de verdad acotado a UN proceso:
//
//   1. En Seguimiento ve la formacion de su proceso y NO la del otro.
//   2. Pedir por su id la que no le toca responde 404, no 403 (un 403 confirma que existe).
//   3. La analitica, los vencimientos (Inicio) y la descarga cuentan solo lo suyo.
//   4. La lista de obligaciones (pantalla Asignaciones) tampoco le enseña las del otro proceso.
//   5. Con `reports:read_all` concedido A EL, ve todo en Seguimiento; Asignaciones sigue acotada,
//      que tiene su propio permiso (`enrollments:read_all`).
//   6. El administrador lo ve todo, antes y despues.

import { crearCliente, paso, comprobar, resumen } from './api.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

paso(1, 'DOS PROCESOS, una formacion en cada uno, y una persona que debe las dos');
const procesos = ((await admin.get('/catalogs/processes')).cuerpo ?? []).filter((p) => p.active);
const tipos = (await admin.get('/catalogs/activity-types')).cuerpo ?? [];
// Un tipo que no se exija solo ni pida examen: aqui no se prueba el contenido, solo quien lo ve.
const tipo = await admin.post('/catalogs/activity-types', {
  code: `E2E_AI_${marca}`,
  name: `Alcance informes ${SUFIJO}`,
  config: { requiresAssessment: false, requiresSurvey: false, issuesCertificate: false, defaultOfferingKind: 'PERMANENT', defaultAssignmentMode: 'MANUAL' },
});
const [propio, ajeno] = procesos;
comprobar(!!propio && !!ajeno && tipo.ok, `procesos «${propio?.name}» (el suyo) y «${ajeno?.name}» (el otro)`, `faltan procesos o tipo: ${tipo.estado} · ${tipos.length} tipos`);
if (!propio || !ajeno || !tipo.ok) { resumen(); process.exit(1); }

const cargo = ((await admin.get('/catalogs/job-titles')).cuerpo ?? []).find((c) => c.active);
const area = ((await admin.get('/catalogs/areas')).cuerpo ?? []).find((a) => a.active);

async function crearFormacion(nombre, processId) {
  const ficha = await admin.post('/activities', {
    code: `AI${marca}_${nombre}`, name: `Alcance ${nombre} ${SUFIJO}`, activityTypeId: tipo.cuerpo.id, processId, modality: 'VIRTUAL',
  });
  const versionId = ((await admin.get(`/activities/${ficha.cuerpo?.id}`)).cuerpo?.versions ?? []).find((v) => v.status === 'DRAFT')?.id;
  const leccion = await admin.post('/lessons', { title: `Contenido ${nombre} ${SUFIJO}`, estimatedMinutes: 3 });
  await admin.pedir(`/lessons/${leccion.cuerpo?.id}/cards`, {
    method: 'PUT',
    body: JSON.stringify({ cards: [{ payload: { cardType: 'TEXT_IMAGE', title: nombre, body: 'Contenido.' } }] }),
  });
  await admin.post(`/activities/versions/${versionId}/contents`, {
    type: 'LESSON', title: 'Contenido', isRequired: true, config: { minSeconds: 1 }, lessonId: leccion.cuerpo?.id,
  });
  await admin.post(`/activities/versions/${versionId}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
  return ficha.cuerpo?.id;
}
const suya = await crearFormacion('PROPIA', propio.id);
const deOtro = await crearFormacion('AJENA', ajeno.id);

const obligada = await admin.post('/users', {
  documentNumber: `85${marca}`, fullName: `Obligada alcance ${SUFIJO}`, jobTitleId: cargo.id, areaId: area.id,
});
const obligadaId = obligada.cuerpo?.user?.id;
// Con fecha limite: sin ella no saldrian en Vencimientos, que es una de las cosas que se miran.
const limite = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
for (const activityId of [suya, deOtro]) {
  const asignada = await admin.post('/assignments', { targetType: 'ACTIVITY', targetId: activityId, userIds: [obligadaId], dueAt: limite });
  comprobar(asignada.ok && asignada.cuerpo?.created === 1, 'obligacion creada', `asignar: ${asignada.estado} ${JSON.stringify(asignada.cuerpo).slice(0, 200)}`);
}

paso(2, 'EL ANALISTA: rol Analista, acotado al primer proceso, sin permisos de mas');
const altaAnalista = await admin.post('/users', {
  documentNumber: `86${marca}`, fullName: `Analista alcance ${SUFIJO}`, jobTitleId: cargo.id, areaId: area.id, roleCode: 'ANALISTA',
});
const analistaId = altaAnalista.cuerpo?.user?.id;
const alcance = await admin.post(`/users/${analistaId}/analyst-scopes`, { scopes: [{ processId: propio.id }] });
comprobar(altaAnalista.ok && alcance.ok, `creado y acotado a «${propio.name}»`, `alta: ${altaAnalista.estado} alcance: ${alcance.estado} ${JSON.stringify(alcance.cuerpo).slice(0, 200)}`);
const analista = crearCliente();
await analista.entrar(`86${marca}`, altaAnalista.cuerpo?.generatedPassword);

const formacionesDe = async (cliente) => ((await cliente.get('/reportes/ejecucion')).cuerpo?.items ?? []).map((f) => f.activityId);

try {
  paso(3, 'SEGUIMIENTO: ve la de su proceso y no la del otro');
  const delAdmin = await formacionesDe(admin);
  comprobar(delAdmin.includes(suya) && delAdmin.includes(deOtro), 'el administrador ve las dos', 'al administrador le falta alguna');
  const delAnalista = await formacionesDe(analista);
  console.log(`   ... el administrador ve ${delAdmin.length} formaciones; el analista, ${delAnalista.length}`);
  comprobar(delAnalista.includes(suya), 'el analista ve la de su proceso', 'no ve la suya');
  comprobar(!delAnalista.includes(deOtro), 'y NO la del otro proceso', 've la del otro proceso');
  comprobar(delAnalista.length < delAdmin.length, 'ni el resto de la empresa', `ve ${delAnalista.length} de ${delAdmin.length}`);

  paso(4, 'POR SU ID: la suya abre; la del otro, 404');
  const abreSuya = await analista.get(`/reportes/actividades/${suya}/ejecucion`);
  comprobar(abreSuya.ok && (abreSuya.cuerpo?.items ?? []).some((f) => f.userId === obligadaId), 'abre la suya y ve a quien la debe', `suya: ${abreSuya.estado}`);
  const abreAjena = await analista.get(`/reportes/actividades/${deOtro}/ejecucion`);
  comprobar(abreAjena.estado === 404, 'la del otro proceso responde 404', `respondio ${abreAjena.estado}`);
  const bajaAjena = await analista.get(`/reportes/actividades/${deOtro}/ejecucion/xlsx`);
  comprobar(bajaAjena.estado === 404, 'y tampoco se la puede descargar', `descarga: ${bajaAjena.estado}`);

  paso(5, 'INICIO Y ANALITICA: las cifras son las de lo suyo');
  const totalAdmin = (await admin.get('/reportes/analitica')).cuerpo?.resumen?.total ?? 0;
  const totalAnalista = (await analista.get('/reportes/analitica')).cuerpo?.resumen?.total ?? 0;
  console.log(`   ... obligaciones en la analitica: administrador ${totalAdmin}, analista ${totalAnalista}`);
  comprobar(totalAnalista >= 1 && totalAnalista < totalAdmin, 'el analista cuenta solo las de su alcance', `analista ${totalAnalista} de ${totalAdmin}`);
  const vencenAdmin = (await admin.get('/reportes/vencimientos?meses=12')).cuerpo?.items ?? [];
  const vencenAnalista = (await analista.get('/reportes/vencimientos?meses=12')).cuerpo?.items ?? [];
  comprobar(vencenAdmin.some((f) => f.actividadId === deOtro), 'en Vencimientos el administrador ve la del otro proceso', 'no sale ni para el administrador');
  comprobar(
    vencenAnalista.some((f) => f.actividadId === suya) && !vencenAnalista.some((f) => f.actividadId === deOtro),
    'el analista ve vencer la suya y no la del otro',
    `filas del analista: ${vencenAnalista.map((f) => f.formacion).join(' · ')}`,
  );

  paso(6, 'ASIGNACIONES: la lista de obligaciones tampoco le enseña las del otro proceso');
  const suyas = (await analista.get(`/assignments?targetId=${suya}`)).cuerpo;
  const ajenas = (await analista.get(`/assignments?targetId=${deOtro}`)).cuerpo;
  comprobar(suyas?.total === 1, 've la obligacion de su formacion', `total=${suyas?.total}`);
  comprobar(ajenas?.total === 0, 'y ninguna de la del otro proceso', `total=${ajenas?.total}`);
  const todasAdmin = (await admin.get('/assignments?pageSize=1')).cuerpo?.total ?? 0;
  const todasAnalista = (await analista.get('/assignments?pageSize=1')).cuerpo?.total ?? 0;
  console.log(`   ... obligaciones en la lista: administrador ${todasAdmin}, analista ${todasAnalista}`);
  comprobar(todasAnalista < todasAdmin, 'sin filtro, ve una parte y no la empresa entera', `analista ${todasAnalista} de ${todasAdmin}`);

  paso('6 bis', 'REQUISITOS, MATRIZ Y ESCRITURAS (2026-10-08): tampoco toca la formacion del otro proceso');
  comprobar((await analista.get(`/activities/${suya}/requirements`)).ok, 'abre «Quienes» de la suya', 'no abre la suya');
  comprobar((await analista.get(`/activities/${deOtro}/requirements`)).estado === 404, '«Quienes» de la del otro proceso: 404', 'la abre');
  const asignaAjena = await analista.post('/assignments', { targetType: 'ACTIVITY', targetId: deOtro, userIds: [obligadaId], dueAt: limite });
  comprobar(asignaAjena.estado === 404, 'no puede asignar la del otro proceso', `asignar: ${asignaAjena.estado}`);
  const obligacionAjena = (await admin.get(`/assignments?targetId=${deOtro}`)).cuerpo?.items?.[0]?.id;
  const eximeAjena = await analista.post(`/assignments/${obligacionAjena}/waive`, { waivedReason: 'Prueba de alcance: no deberia poder.' });
  comprobar(eximeAjena.estado === 404, 'ni eximir una obligacion de esa formacion', `eximir: ${eximeAjena.estado}`);
  const reglasAdmin = ((await admin.get('/assignment-rules')).cuerpo ?? []).length;
  const reglasAnalista = ((await analista.get('/assignment-rules')).cuerpo ?? []).length;
  console.log(`   ... requisitos en la lista: administrador ${reglasAdmin}, analista ${reglasAnalista}`);
  comprobar(reglasAnalista < reglasAdmin, 'la lista de requisitos es la de su alcance', `analista ${reglasAnalista} de ${reglasAdmin}`);
  const matrizAdmin = ((await admin.get('/assignment-rules/job-title-matrix')).cuerpo?.activities ?? []).length;
  const matrizAnalista = ((await analista.get('/assignment-rules/job-title-matrix')).cuerpo?.activities ?? []).length;
  comprobar(matrizAnalista <= matrizAdmin, `la matriz no le enseña de mas (${matrizAnalista} de ${matrizAdmin})`, 'la matriz trae mas que la del administrador');

  paso('6 ter', 'LA SEDE DE UNA CONVOCATORIA NO ACOTA (2026-10-08): es logistica');
  const versionSuya = ((await admin.get(`/activities/${suya}`)).cuerpo?.versions ?? []).find((v) => v.status === 'PUBLISHED')?.id;
  const regionales = ((await admin.get('/catalogs/regionals')).cuerpo ?? []).filter((r) => r.active);
  const vacio = { jobTitleIds: [], areaIds: [], regionalIds: [], serviceIds: [] };
  const sinSede = (await admin.post('/offerings/proyectados', { activityVersionId: versionSuya, scope: vacio, regionalId: null })).cuerpo;
  let iguales = regionales.length > 0;
  for (const regional of regionales) {
    const conSede = (await admin.post('/offerings/proyectados', { activityVersionId: versionSuya, scope: vacio, regionalId: regional.id })).cuerpo;
    if (conSede?.count !== sinSede?.count) iguales = false;
  }
  comprobar(sinSede?.count === 1 && iguales, `con cualquiera de las ${regionales.length} sedes proyecta lo mismo que sin sede (${sinSede?.count})`, `sin sede ${sinSede?.count}; con alguna sede cambia`);

  paso(7, 'CON EL PERMISO, CONCEDIDO A ESA PERSONA: ve todos los informes');
  const concedido = await admin.post(`/users/${analistaId}/overrides`, {
    // Se le QUITA el de alcance a la vez: «ver todo» tiene que bastar para entrar (2026-10-08).
    overrides: [{ permissionCode: 'reports:read_all', granted: true }, { permissionCode: 'reports:read_scope', granted: false }],
  });
  comprobar(concedido.ok, 'se le concede «ver todos los informes»', `overrides: ${concedido.estado} ${JSON.stringify(concedido.cuerpo).slice(0, 200)}`);
  const conPermiso = await formacionesDe(analista);
  comprobar(conPermiso.includes(deOtro), 'ahora ve en Seguimiento la del otro proceso', 'sigue sin verla');
  comprobar((await analista.get(`/reportes/actividades/${deOtro}/ejecucion`)).ok, 'y la abre', 'no la abre');
  const ajenasConPermiso = (await analista.get(`/assignments?targetId=${deOtro}`)).cuerpo;
  comprobar(ajenasConPermiso?.total === 0, 'Asignaciones sigue acotada: es otro permiso', `total=${ajenasConPermiso?.total}`);
} finally {
  paso(8, 'LIMPIEZA');
  await admin.patch(`/users/${analistaId}`, { active: false });
  await admin.patch(`/catalogs/activity-types/${tipo.cuerpo.id}`, { active: false });
  console.log(`CREADO PARA LIMPIAR: sufijo=${SUFIJO}`);
}

process.exit(resumen() === 0 ? 0 : 1);
