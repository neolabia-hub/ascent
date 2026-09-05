// ACOTAMIENTOS Y REGLAS MULTIPLES — en TODOS los tipos y por TODAS las facetas.
//
// ─── LAS PREGUNTAS DEL CLIENTE, Y POR QUE NO BASTABA CON RAZONARLAS ───
//
//   1. "Dos jornadas de la misma formacion para regionales diferentes, ¿se suman bien?... no solo
//      por regional, por cualquier campo que se pueda acotar."
//   2. "¿La probaste solo en el plan o en las demas tambien? ¿Todas funcionan igual?"
//   3. "Lo mismo con varias reglas, para todo tipo de formacion."
//
// La respuesta corta a la 2 es que `projected-audience.service.ts` **no mira el tipo**: recibe una
// actividad y una tajada, y deriva en tres escalones (obligados -> reglas -> nada). Pero eso es leer
// el codigo, no medirlo — y el fallo que este mismo recorrido encontro el 2026-09-04 estaba
// precisamente en un escalon que nadie ejercia. Asi que se prueban los SEIS tipos.
//
// ─── LO QUE COMPRUEBA, PARA CADA COMBINACION ───
//
//   a. Cada jornada acotada proyecta SOLO a los suyos.
//   b. Las dos juntas SUMAN el total: ni repiten a nadie ni pierden a nadie. Si se solaparan, el
//      plan contaria dos veces a la misma persona —y publicar CONGELA ese numero—; si se quedaran
//      cortas, habria obligados que ninguna jornada cubre.
//   c. Una tajada donde no hay obligados proyecta CERO, y no cae al total. Es el fallo silencioso
//      de estos filtros: cuando no encuentra a nadie, lo comodo es devolver "todos".
//   d. Con DOS reglas sobre la misma formacion, los proyectados son la UNION, no la suma: quien
//      cumple las dos cuenta una vez.
import { crearCliente, paso, ok, mal, comprobar, resumen } from './api.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;
const VACIO = {
  match: 'ALL', jobTitleIds: [], jobTitleTypeIds: [], areaIds: [], regionalIds: [],
  serviceIds: [], employmentTypes: [], roadActors: [],
};
const creado = { actividades: [], offerings: [] };

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

const catalogo = async (clave) => ((await admin.get(`/catalogs/${clave}`)).cuerpo ?? []).filter((f) => f.active !== false);
const cuantos = async (scope) => (await admin.post('/audiences/preview', { ...VACIO, ...scope })).cuerpo?.count ?? 0;
const proyectadosDe = async (id) => (await admin.get(`/offerings/${id}/projected`)).cuerpo;

paso(1, 'QUE FACETAS TIENEN DATOS PARA PARTIR EN DOS');
const FACETAS = [
  { clave: 'areaIds', nombre: 'Area', valores: (await catalogo('areas')).map((f) => ({ id: f.id, etiqueta: f.name })) },
  { clave: 'jobTitleIds', nombre: 'Cargo', valores: (await catalogo('job-titles')).map((f) => ({ id: f.id, etiqueta: f.name })) },
  { clave: 'regionalIds', nombre: 'Regional', valores: (await catalogo('regionals')).map((f) => ({ id: f.id, etiqueta: f.name })) },
  { clave: 'serviceIds', nombre: 'Servicio', valores: (await catalogo('services')).map((f) => ({ id: f.id, etiqueta: f.name })) },
  { clave: 'jobTitleTypeIds', nombre: 'Tipo de cargo', valores: (await catalogo('job-title-types')).map((f) => ({ id: f.id, etiqueta: f.name })) },
  { clave: 'employmentTypes', nombre: 'Vinculacion', valores: ['DIRECTO', 'CONTRATISTA', 'TEMPORAL', 'EN_MISION'].map((v) => ({ id: v, etiqueta: v })) },
  { clave: 'roadActors', nombre: 'Actor vial', valores: ['CONDUCTOR', 'MOTOCICLISTA', 'CICLISTA', 'PEATON', 'PASAJERO'].map((v) => ({ id: v, etiqueta: v })) },
];

const listas = [];
for (const faceta of FACETAS) {
  const conGente = [];
  // Hasta 12 valores por faceta: recorrer los 250 cargos costaria 250 peticiones para dar con dos.
  for (const valor of faceta.valores.slice(0, 12)) {
    const n = await cuantos({ [faceta.clave]: [valor.id] });
    if (n > 0) conGente.push({ ...valor, n });
    if (conGente.length >= 2) break;
  }
  const vacio = faceta.valores.slice(0, 12).find((v) => !conGente.some((c) => c.id === v.id));
  if (conGente.length >= 2) {
    listas.push({ ...faceta, a: conGente[0], b: conGente[1], vacio });
    console.log(`   ... ${faceta.nombre}: "${conGente[0].etiqueta}" (${conGente[0].n}) y "${conGente[1].etiqueta}" (${conGente[1].n})`);
  } else {
    console.log(`   ... ${faceta.nombre}: sin dos valores con gente, se salta`);
  }
}
comprobar(listas.length >= 2, `hay ${listas.length} faceta(s) con datos`, 'no hay datos para probar ninguna faceta');
if (listas.length === 0) { resumen(); process.exit(1); }

const tipos = (await admin.get('/catalogs/activity-types')).cuerpo;
const procesos = (await admin.get('/catalogs/processes')).cuerpo;
const proceso = procesos.find((p) => p.active) ?? procesos[0];

/** Monta una formacion publicada del tipo pedido y devuelve sus ids. */
async function montarFormacion(tipo, etiqueta) {
  const ficha = await admin.post('/activities', {
    code: `TAJ_${etiqueta}_${SUFIJO}`.slice(0, 40),
    name: `Tajadas ${tipo.name} ${etiqueta} ${SUFIJO}`,
    activityTypeId: tipo.id, processId: proceso.id, modality: 'PRESENCIAL',
  });
  if (!ficha.ok) { mal(`ficha de ${tipo.name}: ${ficha.estado} ${JSON.stringify(ficha.cuerpo).slice(0, 200)}`); return null; }
  const activityId = ficha.cuerpo.id;
  creado.actividades.push(activityId);
  const versionId = ((await admin.get(`/activities/${activityId}`)).cuerpo?.versions ?? []).find((v) => v.status === 'DRAFT')?.id;

  const leccion = await admin.post('/lessons', { title: `L ${etiqueta} ${SUFIJO}`, estimatedMinutes: 5 });
  await admin.pedir(`/lessons/${leccion.cuerpo.id}/cards`, { method: 'PUT', body: JSON.stringify({
    cards: [{ payload: { cardType: 'TEXT_IMAGE', title: 'Tema', body: 'Contenido.' } }],
  }) });
  await admin.post(`/activities/versions/${versionId}/contents`, {
    type: 'LESSON', title: 'Contenido', isRequired: true, config: { minSeconds: 1 }, lessonId: leccion.cuerpo.id,
  });

  // La pildora se publica SIN examen; los otros cinco lo exigen.
  if (tipo.config?.requiresAssessment) {
    const q = await admin.post('/questions', {
      payload: { qtype: 'SINGLE', stem: 'Pregunta', options: [{ id: 'a', text: 'Si' }, { id: 'b', text: 'No' }], correctOptionId: 'a', points: 1 },
    });
    const ex = await admin.post('/assessments', { title: `E ${etiqueta} ${SUFIJO}` });
    await admin.patch(`/assessments/${ex.cuerpo.id}`, {
      passingScore: 80, maxAttempts: 3, sections: [{ mode: 'FIXED', questionIds: [q.cuerpo.id] }],
    });
    await admin.post(`/activities/versions/${versionId}/contents`, {
      type: 'ASSESSMENT', title: 'Examen', isRequired: true, config: {}, assessmentId: ex.cuerpo.id,
    });
  }

  const pub = await admin.post(`/activities/versions/${versionId}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
  if (!pub.ok) { mal(`publicar ${tipo.name}: ${pub.estado} ${JSON.stringify(pub.cuerpo).slice(0, 250)}`); return null; }

  /*
    LOS AUTOMATISMOS SE RETIRAN. La general y la reinduccion crean su requisito al publicar —a toda
    la empresa— y este recorrido necesita controlar el alcance para poder comprobar el reparto.
  */
  const automaticos = (await admin.get(`/activities/${activityId}/requirements`)).cuerpo ?? [];
  for (const r of automaticos) await admin.pedir(`/activities/${activityId}/requirements/${r.id}`, { method: 'DELETE' });
  if (automaticos.length > 0) console.log(`   ... retirado(s) ${automaticos.length} requisito(s) automatico(s) de ${tipo.name}`);

  return { activityId, versionId };
}

let mesSiguiente = 0;
async function crearJornada(versionId, etiqueta, scope) {
  const mes = (mesSiguiente++ % 12) + 1;
  const r = await admin.post('/offerings', {
    activityVersionId: versionId,
    kind: 'EVENT', modality: 'PRESENCIAL',
    scheduledDate: `${new Date().getFullYear() + 3}-${String(mes).padStart(2, '0')}-14`,
    startTime: '08:00', endTime: '12:00', location: etiqueta.slice(0, 120), executedBy: 'PROPIOS', capacity: 5000,
    ...(scope ? { audienceScope: { ...VACIO, ...scope } } : {}),
  });
  if (!r.ok) { mal(`jornada "${etiqueta}": ${r.estado} ${JSON.stringify(r.cuerpo).slice(0, 200)}`); return null; }
  creado.offerings.push(r.cuerpo.id);
  return r.cuerpo.id;
}

/** El nucleo: exige la formacion a dos valores de una faceta y comprueba que el reparto PARTE. */
async function probarReparto({ activityId, versionId }, faceta, etiquetaTipo) {
  const requisito = await admin.post(`/activities/${activityId}/requirements`, {
    scope: { match: 'ALL', [faceta.clave]: [faceta.a.id, faceta.b.id] },
    trigger: 'ON_JOIN', dueDaysAfterTrigger: 0,
  });
  if (!requisito.ok) { mal(`requisito ${etiquetaTipo}/${faceta.nombre}: ${requisito.estado} ${JSON.stringify(requisito.cuerpo).slice(0, 200)}`); return; }
  const ruleId = requisito.cuerpo?.id ?? requisito.cuerpo?.ruleId;

  const req = ((await admin.get(`/activities/${activityId}/requirements`)).cuerpo ?? []).find((r) => r.id === ruleId);
  const alcance = req?.reach ?? 0;
  comprobar(
    alcance === faceta.a.n + faceta.b.n,
    `${etiquetaTipo} · ${faceta.nombre}: la regla alcanza a ${alcance} = ${faceta.a.n} + ${faceta.b.n}`,
    `${etiquetaTipo} · ${faceta.nombre}: alcanza a ${alcance} y los dos valores suman ${faceta.a.n + faceta.b.n}`,
  );

  const sinTajada = await crearJornada(versionId, `Todos ${faceta.nombre} ${SUFIJO}`, null);
  const jA = await crearJornada(versionId, `${faceta.a.etiqueta} ${SUFIJO}`, { [faceta.clave]: [faceta.a.id] });
  const jB = await crearJornada(versionId, `${faceta.b.etiqueta} ${SUFIJO}`, { [faceta.clave]: [faceta.b.id] });
  if (!sinTajada || !jA || !jB) { await admin.pedir(`/activities/${activityId}/requirements/${ruleId}`, { method: 'DELETE' }); return; }

  const [pSin, pA, pB] = await Promise.all([proyectadosDe(sinTajada), proyectadosDe(jA), proyectadosDe(jB)]);
  console.log(`   ... [${pSin?.source}] sin acotar ${pSin?.count} · "${faceta.a.etiqueta}" ${pA?.count} · "${faceta.b.etiqueta}" ${pB?.count}`);

  comprobar(
    pA?.count === faceta.a.n && pB?.count === faceta.b.n,
    `${etiquetaTipo} · ${faceta.nombre}: cada jornada se lleva SOLO a los suyos (${faceta.a.n} y ${faceta.b.n})`,
    `${etiquetaTipo} · ${faceta.nombre}: proyectan ${pA?.count} y ${pB?.count}, deberian ser ${faceta.a.n} y ${faceta.b.n}`,
  );
  const suma = (pA?.count ?? 0) + (pB?.count ?? 0);
  comprobar(
    suma === pSin?.count,
    `${etiquetaTipo} · ${faceta.nombre}: juntas suman el total (${suma}): el reparto es una particion`,
    `${etiquetaTipo} · ${faceta.nombre}: suman ${suma} y el total es ${pSin?.count} — ${suma > (pSin?.count ?? 0) ? 'se SOLAPAN' : 'se quedan CORTAS'}`,
  );
  const idsA = new Set(pA?.userIds ?? []);
  const repetidos = (pB?.userIds ?? []).filter((id) => idsA.has(id));
  comprobar(repetidos.length === 0, `${etiquetaTipo} · ${faceta.nombre}: nadie sale en las dos`, `${repetidos.length} persona(s) en las dos jornadas`);

  if (faceta.vacio) {
    const jVacia = await crearJornada(versionId, `Sin obligados ${faceta.nombre} ${SUFIJO}`, { [faceta.clave]: [faceta.vacio.id] });
    if (jVacia) {
      const pV = await proyectadosDe(jVacia);
      comprobar(
        pV?.count === 0,
        `${etiquetaTipo} · ${faceta.nombre}: una tajada sin obligados ("${faceta.vacio.etiqueta}") proyecta 0`,
        `${etiquetaTipo} · ${faceta.nombre}: proyecta ${pV?.count} donde no hay ningun obligado`,
      );
    }
  }

  await admin.pedir(`/activities/${activityId}/requirements/${ruleId}`, { method: 'DELETE' });
}

paso(2, 'EL PLAN, por TODAS las facetas: es donde el reparto decide la cobertura del ano');
const tipoPlan = tipos.find((t) => t.code === 'PLAN');
const delPlan = tipoPlan ? await montarFormacion(tipoPlan, 'PLAN') : null;
if (delPlan) {
  for (const faceta of listas) await probarReparto(delPlan, faceta, 'Plan');
} else {
  mal('no se pudo montar la formacion del plan');
}

paso(3, 'Y LOS OTROS SEIS TIPOS: ¿se comporta igual el acotamiento?');
/*
  `projected-audience.service.ts` no mira el tipo —recibe una actividad y una tajada— asi que la
  respuesta deberia ser "igual en los siete". Se comprueba de todos modos, con UNA faceta por tipo:
  lo que se quiere saber es si el TIPO cambia algo, no repetir las siete facetas siete veces.
*/
const facetaComun = listas[0];
/*
  La etiqueta va NUMERADA y no recortada del codigo: "INDUCCION_GENERAL" y "INDUCCION_ESPECIFICA"
  cortados a diez caracteres dan los dos "INDUCCION_", y la segunda formacion moria en
  `DUPLICATE_CODE` — un fallo del recorrido que se lee como un fallo del producto.
*/
const OTROS = ['INDUCCION_GENERAL', 'INDUCCION_ESPECIFICA', 'REINDUCCION', 'EXTRA', 'MICROLEARNING', 'RECERTIFICACION'];
for (const [i, codigo] of OTROS.entries()) {
  const tipo = tipos.find((t) => t.code === codigo);
  if (!tipo) { mal(`no existe el tipo ${codigo}`); continue; }
  const montada = await montarFormacion(tipo, `T${i + 1}`);
  if (montada) await probarReparto(montada, facetaComun, tipo.name);
}

paso(4, 'DOS REGLAS SOBRE LA MISMA FORMACION: los proyectados son la UNION, no la suma');
/*
  El otro lado de la pregunta. Con dos requisitos que se SOLAPAN —un area y un cargo que comparten
  gente— los proyectados no pueden sumarlos: una persona obligada por dos reglas sigue siendo una
  persona a la que capacitar. Si se sumaran, el denominador del plan creceria sin que entre nadie.
*/
const areaF = listas.find((f) => f.clave === 'areaIds');
const cargoF = listas.find((f) => f.clave === 'jobTitleIds');
if (!areaF || !cargoF) {
  ok('no hay area y cargo a la vez con datos: no se puede montar el solape, y no se inventa');
} else {
  const dosReglas = tipoPlan ? await montarFormacion(tipoPlan, 'DOSREGLAS') : null;
  if (dosReglas) {
    const soloArea = await cuantos({ areaIds: [areaF.a.id] });
    const soloCargo = await cuantos({ jobTitleIds: [cargoF.a.id] });
    const union = await cuantos({ match: 'ANY', areaIds: [areaF.a.id], jobTitleIds: [cargoF.a.id] });
    const solape = soloArea + soloCargo - union;
    console.log(`   ... area "${areaF.a.etiqueta}": ${soloArea} · cargo "${cargoF.a.etiqueta}": ${soloCargo} · union: ${union} · comparten ${solape}`);

    const r1 = await admin.post(`/activities/${dosReglas.activityId}/requirements`, {
      scope: { match: 'ALL', areaIds: [areaF.a.id] }, trigger: 'ON_JOIN', dueDaysAfterTrigger: 0,
    });
    const r2 = await admin.post(`/activities/${dosReglas.activityId}/requirements`, {
      scope: { match: 'ALL', jobTitleIds: [cargoF.a.id] }, trigger: 'ON_JOIN', dueDaysAfterTrigger: 0,
    });
    comprobar(r1.ok && r2.ok, 'las dos reglas se crean sobre la misma formacion', `r1: ${r1.estado} · r2: ${r2.estado}`);
    const reglas = (await admin.get(`/activities/${dosReglas.activityId}/requirements`)).cuerpo ?? [];
    comprobar(reglas.length === 2, 'y quedan como DOS reglas independientes', `hay ${reglas.length}`);

    const jTodos = await crearJornada(dosReglas.versionId, `Union ${SUFIJO}`, null);
    if (jTodos) {
      const pUnion = await proyectadosDe(jTodos);
      console.log(`   ... proyecta ${pUnion?.count} · la union real es ${union} · sumarlas daria ${soloArea + soloCargo}`);
      comprobar(
        pUnion?.count === union,
        `los proyectados son la UNION (${union}): quien cumple las dos reglas cuenta UNA vez`,
        `proyecta ${pUnion?.count}; la union es ${union} y la suma seria ${soloArea + soloCargo}${solape > 0 ? ` (comparten ${solape} personas)` : ''}`,
      );
      const unicos = new Set(pUnion?.userIds ?? []).size;
      comprobar(unicos === (pUnion?.userIds ?? []).length, 'y ninguna persona sale repetida en la lista', `${(pUnion?.userIds ?? []).length - unicos} repetida(s)`);
    }
    for (const r of reglas) await admin.pedir(`/activities/${dosReglas.activityId}/requirements/${r.id}`, { method: 'DELETE' });
  }
}

paso(5, 'LIMPIEZA');
for (const id of creado.offerings) {
  const r = await admin.pedir(`/offerings/${id}`, { method: 'DELETE' });
  if (!r.ok && r.estado !== 404) console.log(`   ... la jornada ${String(id).slice(0, 8)} no se borro (${r.estado}); queda en BORRADOR`);
}
let pendientes = 0;
for (const id of creado.actividades) {
  const v = (await admin.get(`/assignments?targetId=${id}&status=PENDING`)).cuerpo;
  pendientes += v?.total ?? 0;
}
comprobar(pendientes === 0, 'no queda ninguna obligacion pendiente viva', `quedan ${pendientes} pendientes`);

console.log(`\nCREADO PARA LIMPIAR: ${creado.actividades.length} actividades · sufijo=${SUFIJO}`);
process.exit(resumen() === 0 ? 0 : 1);
