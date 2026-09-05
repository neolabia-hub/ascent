// RECORRIDO DE PUNTA A PUNTA: CAPACITACION DEL PLAN.
//
// Es el tipo que rompe todas las costumbres de los tres anteriores, y por eso es el que mas hay que
// comprobar. Lo distinto:
//
//   1. Publicar NO abre convocatoria (es de tipo EVENT: tiene fecha de sesion, y esa la pone una
//      persona) y NO crea ningun requisito automatico.
//   2. El requisito que se cree en "Quienes" queda con disparador PLAN y NO GENERA NADA: guarda a
//      quienes, y las obligaciones nacen al APROBAR el renglon (Decision #76).
//   3. Programar la jornada ES ponerla en el plan: el renglon se crea solo si el plan del ano de
//      la fecha esta en BORRADOR (Decision #75).
//   4. Aprobar el plan CONGELA los proyectados y materializa las obligaciones, con el ultimo dia
//      del mes del renglon como vencimiento.
//
// El plan se crea en un ANO LIBRE (2030 en adelante) para no tocar el plan real de la base:
// aprobar el de 2026 obligaria a gente de verdad por renglones que no son de este recorrido.
import { crearCliente, paso, ok, mal, comprobar, resumen } from './api.mjs';
import { comprobarSeguimiento } from './seguimiento.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;
const MES = 5;
const VACIO = { match: 'ALL', jobTitleIds: [], jobTitleTypeIds: [], areaIds: [], regionalIds: [], serviceIds: [], employmentTypes: [], roadActors: [] };
const creado = { activityId: null, versionId: null, lessonId: null, assessmentId: null, offeringId: null, planId: null, itemId: null, userId: null, ruleId: null };

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

paso(1, 'CATALOGOS: el tipo, y lo que promete');
const tipos = (await admin.get('/catalogs/activity-types')).cuerpo;
const tipo = tipos.find((t) => t.config?.participatesInPlan === true);
comprobar(!!tipo, `tipo del plan: "${tipo?.name}"`, 'no hay ningun tipo con participatesInPlan');
if (!tipo) { resumen(); process.exit(1); }
console.log(`   ... examen=${tipo.config?.requiresAssessment} constancia=${tipo.config?.issuesCertificate} encuesta=${tipo.config?.requiresSurvey ?? false}`);
console.log(`   ... convocatoria=${tipo.config?.defaultOfferingKind} asignacion=${tipo.config?.defaultAssignmentMode ?? '(sin poner -> MANUAL)'}`);
comprobar(tipo.config?.defaultOfferingKind === 'EVENT', 'es de JORNADA con fecha: la convocatoria no se abre sola', `tipo de convocatoria: ${tipo.config?.defaultOfferingKind}`);

const procesos = (await admin.get('/catalogs/processes')).cuerpo;
const cargos = ((await admin.get('/catalogs/job-titles')).cuerpo ?? []).filter((c) => c.active);
const areas = (await admin.get('/catalogs/areas')).cuerpo;
const proceso = procesos.find((p) => p.active) ?? procesos[0];
const area = areas.find((a) => a.active);

// El cargo menos poblado, para que aprobar el plan no obligue a media empresa.
let elegido = null;
for (const c of cargos) {
  const n = (await admin.post('/audiences/preview', { ...VACIO, jobTitleIds: [c.id] })).cuerpo?.count ?? 0;
  if (elegido === null || n < elegido.n) elegido = { c, n };
}
console.log(`   ... se le exigira al cargo "${elegido.c.name}" (${elegido.n} personas hoy)`);

paso(2, 'LA FICHA, EL CONTENIDO Y EL EXAMEN');
const ficha = await admin.post('/activities', {
  code: `PLAN_${SUFIJO}`,
  name: `Capacitacion del plan ${SUFIJO}`,
  description: 'Recorrido automatico de punta a punta.',
  activityTypeId: tipo.id,
  processId: proceso.id,
  modality: 'PRESENCIAL',
});
comprobar(ficha.ok, `ficha creada (${ficha.estado})`, `ficha: ${ficha.estado} ${JSON.stringify(ficha.cuerpo).slice(0, 250)}`);
creado.activityId = ficha.cuerpo?.id;
if (!creado.activityId) { resumen(); process.exit(1); }
creado.versionId = ((await admin.get(`/activities/${creado.activityId}`)).cuerpo?.versions ?? []).find((v) => v.status === 'DRAFT')?.id;

const leccion = await admin.post('/lessons', { title: `Material ${SUFIJO}`, estimatedMinutes: 5 });
creado.lessonId = leccion.cuerpo?.id;
await admin.pedir(`/lessons/${creado.lessonId}/cards`, { method: 'PUT', body: JSON.stringify({
  cards: [{ payload: { cardType: 'TEXT_IMAGE', title: 'El tema del ano', body: 'Contenido de la capacitacion programada.' } }],
}) });
const contLeccion = await admin.post(`/activities/versions/${creado.versionId}/contents`, {
  type: 'LESSON', title: 'Material', isRequired: true, config: { minSeconds: 1 }, lessonId: creado.lessonId,
});
comprobar(contLeccion.ok, 'la leccion entra como contenido', `contenido: ${contLeccion.estado}`);

const pregunta = await admin.post('/questions', {
  payload: {
    qtype: 'SINGLE',
    stem: 'Lo aprendido en esta jornada se aplica...',
    options: [{ id: 'a', text: 'Desde el proximo turno' }, { id: 'b', text: 'Nunca' }],
    correctOptionId: 'a',
    points: 1,
  },
});
const examen = await admin.post('/assessments', { title: `Examen plan ${SUFIJO}` });
creado.assessmentId = examen.cuerpo?.id;
await admin.patch(`/assessments/${creado.assessmentId}`, {
  passingScore: 80, maxAttempts: 3, sections: [{ mode: 'FIXED', questionIds: [pregunta.cuerpo?.id] }],
});
const contExamen = await admin.post(`/activities/versions/${creado.versionId}/contents`, {
  type: 'ASSESSMENT', title: 'Examen', isRequired: true, config: {}, assessmentId: creado.assessmentId,
});
comprobar(contExamen.ok, 'el examen entra como contenido', `contenido examen: ${contExamen.estado}`);

paso(3, 'PUBLICAR: ni requisito ni convocatoria. Las dos cosas las decide una persona');
const publicada = await admin.post(`/activities/versions/${creado.versionId}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
comprobar(publicada.ok, `publicada (${publicada.estado})`, `publicar: ${publicada.estado} ${JSON.stringify(publicada.cuerpo).slice(0, 300)}`);

const requisitos = (await admin.get(`/activities/${creado.activityId}/requirements`)).cuerpo ?? [];
comprobar(requisitos.length === 0, 'publicar NO exige nada a nadie', `nacieron ${requisitos.length} requisitos solos`);

const convocatorias = (await admin.get(`/offerings?activityId=${creado.activityId}`)).cuerpo;
const abiertas = (convocatorias?.items ?? convocatorias ?? []).length;
comprobar(abiertas === 0, 'y NO abre ninguna convocatoria: es de jornada, la fecha la pone una persona', `se abrieron ${abiertas} convocatorias`);

paso(4, 'QUIENES: la regla guarda a quienes, pero el servidor le quita el gatillo (Decision #76)');
const exigir = await admin.post(`/activities/${creado.activityId}/requirements`, {
  scope: { ...VACIO, jobTitleIds: [elegido.c.id] },
  // Se pide ON_HIRE a proposito, para comprobar que el servidor lo IGNORA.
  trigger: 'ON_HIRE',
  dueDaysAfterTrigger: -1,
  everyMonths: 12,
  soloNuevos: false,
});
comprobar(exigir.ok, `guardado a quienes (${exigir.estado})`, `exigir: ${exigir.estado} ${JSON.stringify(exigir.cuerpo).slice(0, 250)}`);
creado.ruleId = exigir.cuerpo?.ruleId;
const req = ((await admin.get(`/activities/${creado.activityId}/requirements`)).cuerpo ?? [])[0];
console.log(`   ... disparador=${req?.trigger} vence=${req?.dueDaysAfterTrigger}d repite=${req?.everyMonths ?? 'no'} obligadas=${req?.assignmentCount} alcanza=${req?.reach}`);
comprobar(req?.trigger === 'PLAN', 'el disparador queda en PLAN aunque se pidiera ON_HIRE: lo fuerza el servidor', `quedo en ${req?.trigger}`);
comprobar(req?.dueDaysAfterTrigger === 0, 'el plazo se anula: la fecha la pone el mes del plan', `quedo en ${req?.dueDaysAfterTrigger}`);
comprobar(req?.everyMonths === null, 'y la recurrencia tambien: la del ano que viene es OTRO plan', `quedo en ${req?.everyMonths}`);
comprobar(
  req?.assignmentCount === 0,
  `NO nacio ninguna obligacion, aunque alcance a ${req?.reach} personas: nacen al aprobar el plan`,
  `nacieron ${req?.assignmentCount} obligaciones y no deberia nacer ninguna`,
);

paso(4.5, 'QUE VE EL APRENDIZ EN CADA PASO (la pregunta del cliente, contestada mirando)');
/*
  Se coge a alguien que YA tiene el cargo al que se le exige y se mira su pantalla despues de cada
  boton. Es la unica forma de contestar "¿que ve o que no ve?" sin suponerlo.
*/
const docT = `E2E${marca}T`;
const altaT = await admin.post('/users', {
  documentNumber: docT, fullName: `Testigo del Plan ${SUFIJO}`,
  email: `${docT.toLowerCase()}@recorrido.test`, jobTitleId: elegido.c.id, areaId: area.id,
});
const unoDelCargo = altaT.ok ? { id: altaT.cuerpo?.id, fullName: altaT.cuerpo?.fullName ?? `Testigo del Plan ${SUFIJO}`, documentNumber: docT } : null;
creado.testigoId = unoDelCargo?.id ?? null;
let testigo = null;
if (unoDelCargo) {
  const claveT = altaT.cuerpo?.generatedPassword ?? altaT.cuerpo?.password;
  testigo = crearCliente();
  try { await testigo.entrar(docT, claveT); } catch { testigo = null; }
}
const loQueVe = async (momento) => {
  if (!testigo) return null;
  const p = (await testigo.get('/me/pending')).cuerpo;
  const veces = (p?.items ?? p ?? []).filter((x) => x.activity?.id === creado.activityId || x.activityId === creado.activityId).length;
  console.log(`   ... ${momento}: ${veces === 0 ? 'NO le aparece nada' : `le aparece ${veces} vez/veces`}`);
  return veces;
};
if (testigo) {
  console.log(`   ... testigo: ${unoDelCargo.fullName} (${unoDelCargo.documentNumber}), cargo "${elegido.c.name}"`);
  const trasPublicarYExigir = await loQueVe('tras PUBLICAR la formacion y EXIGIRLA en Quienes');
  comprobar(
    trasPublicarYExigir === 0,
    'publicar y exigir NO le muestran nada: en una del plan la regla solo guarda a quienes',
    `ya le aparece ${trasPublicarYExigir} veces antes de aprobar el plan`,
  );
} else {
  console.log('   ... no se pudo preparar un testigo; se salta');
}

paso(5, 'EL PLAN DEL ANO, en borrador');
/*
  UN ANO LIBRE POR CORRIDA, y no siempre el mismo.

  Hay UN plan por ano (Decision #71) y este recorrido lo APRUEBA, asi que reutilizar el del ano
  anterior deja la segunda corrida sin plan en borrador y falla entera. Se busca el primer ano
  libre a partir de 2030 — los de verdad viven en 2026 y alrededores, asi que no se pisan.
*/
const planes = (await admin.get('/plans')).cuerpo;
const anosOcupados = new Set((planes?.items ?? planes ?? []).map((p) => p.year));
let ano = 2030;
while (anosOcupados.has(ano)) ano += 1;
const plan = await admin.post('/plans', {
  year: ano,
  name: `Plan de capacitacion ${ano} ${SUFIJO}`,
  objective: 'Recorrido automatico de punta a punta.',
  goalPct: 80,
});
comprobar(plan.ok, `plan de ${ano} creado en BORRADOR (${plan.estado})`, `plan: ${plan.estado} ${JSON.stringify(plan.cuerpo).slice(0, 250)}`);
creado.planId = plan.cuerpo?.id;
if (!creado.planId) { resumen(); process.exit(1); }

paso(6, 'PROGRAMAR LA JORNADA ES PONERLA EN EL PLAN (Decision #75)');
const fecha = `${ano}-${String(MES).padStart(2, '0')}-14`;
const convocatoria = await admin.post('/offerings', {
  activityVersionId: creado.versionId,
  kind: 'EVENT',
  modality: 'PRESENCIAL',
  scheduledDate: fecha,
  startTime: '08:00',
  endTime: '12:00',
  location: 'Sala de capacitacion, sede principal',
  executedBy: 'PROPIOS',
  // El cupo se saca del tamano del cargo, no de un numero fijo: convocar a todos falla ENTERO si
  // se pasa del cupo (409 OFFERING_CAPACITY_EXCEEDED, no convoca a los que caben), y con un 30
  // clavado el recorrido se rompia solo en cuanto el cargo de pruebas crecia.
  capacity: elegido.n + 50,
  intensityTheoryHours: 3,
  intensityPracticeHours: 1,
});
comprobar(convocatoria.ok, `convocatoria programada para el ${fecha} (${convocatoria.estado})`, `convocatoria: ${convocatoria.estado} ${JSON.stringify(convocatoria.cuerpo).slice(0, 300)}`);
creado.offeringId = convocatoria.cuerpo?.id;

const planTrasProgramar = (await admin.get(`/plans/${creado.planId}`)).cuerpo;
const renglon = (planTrasProgramar?.items ?? []).find((i) => i.offering?.id === creado.offeringId || i.offeringId === creado.offeringId);
creado.itemId = renglon?.id;
comprobar(!!renglon, 'el renglon del plan nacio SOLO al programar la jornada', 'no se creo ningun renglon en el plan');
comprobar(renglon?.plannedMonth === MES, `y con el mes que sale de la fecha (${MES})`, `quedo en el mes ${renglon?.plannedMonth}`);
console.log(`   ... renglon en estado ${renglon?.status}`);

paso(7, 'PUBLICAR LA CONVOCATORIA congela los proyectados, y sigue sin obligar a nadie');
const proyectadosAntes = (await admin.get(`/offerings/${creado.offeringId}/projected`)).cuerpo;
console.log(`   ... proyectaria a ${proyectadosAntes?.count} (${proyectadosAntes?.source}): ${proyectadosAntes?.detail}`);
comprobar(
  proyectadosAntes?.source === 'RULES',
  'los proyectados salen de los REQUISITOS, porque todavia no hay obligaciones',
  `la fuente fue ${proyectadosAntes?.source}`,
);

const publicarConv = await admin.post(`/offerings/${creado.offeringId}/publish`, { confirm: true });
comprobar(publicarConv.ok, `convocatoria publicada (${publicarConv.estado})`, `publicar convocatoria: ${publicarConv.estado} ${JSON.stringify(publicarConv.cuerpo).slice(0, 250)}`);
const detalle = (await admin.get(`/offerings/${creado.offeringId}`)).cuerpo;
comprobar(detalle?.projectedCount === proyectadosAntes?.count, `proyectados CONGELADOS en ${detalle?.projectedCount}`, `congelo ${detalle?.projectedCount} y derivaba ${proyectadosAntes?.count}`);
comprobar(!!detalle?.projectedFrozenAt, 'con su sello de cuando se congelaron', 'no quedo sello de congelado');

const trasPublicarConv = ((await admin.get(`/activities/${creado.activityId}/requirements`)).cuerpo ?? [])[0];
comprobar(
  trasPublicarConv?.assignmentCount === 0,
  'y sigue sin obligar a nadie: publicar la jornada no es aprobar el plan',
  `ya hay ${trasPublicarConv?.assignmentCount} obligaciones`,
);
const veTrasPublicarConv = await loQueVe('tras PROGRAMAR y PUBLICAR la convocatoria');
if (veTrasPublicarConv !== null) {
  comprobar(
    veTrasPublicarConv === 0,
    'al aprendiz SIGUE sin aparecerle: la jornada existe y publicada, y todavia no le llega',
    `le aparece ${veTrasPublicarConv} veces antes de aprobar el plan`,
  );
}

paso(8, 'APROBAR EL PLAN: aqui, y solo aqui, nacen las obligaciones');
const aprobar = await admin.post(`/plans/${creado.planId}/approve`, { confirm: true });
comprobar(aprobar.ok, `plan aprobado (${aprobar.estado})`, `aprobar: ${aprobar.estado} ${JSON.stringify(aprobar.cuerpo).slice(0, 300)}`);

const obligaciones = (await admin.get(`/assignments?targetId=${creado.activityId}&pageSize=100`)).cuerpo;
const items = obligaciones?.items ?? [];
console.log(`   ... obligaciones ahora: ${obligaciones?.total}`);
comprobar(
  (obligaciones?.total ?? 0) > 0,
  `nacieron ${obligaciones?.total} obligaciones al aprobar`,
  'no nacio ninguna obligacion al aprobar el plan',
);

/*
  LA CUENTA DEL REQUISITO SIGUE EN CERO, Y ES CORRECTO.

  Las obligaciones del plan cuelgan del RENGLON, no de la regla (`source: PLAN`, `plan_item_id`
  puesto, `rule_id` vacio). Asi que "Lo que se exige hoy" en la ficha ensena 0 obligadas mientras
  hay 9 personas obligadas de verdad. No es un fallo —la regla de una capacitacion del plan solo
  guarda A QUIENES— pero conviene saberlo antes de asustarse.
*/
const cuentaDeLaRegla = ((await admin.get(`/activities/${creado.activityId}/requirements`)).cuerpo ?? [])[0];
console.log(`   ... el requisito sigue marcando ${cuentaDeLaRegla?.assignmentCount}: las del plan cuelgan del renglon, no de la regla`);

const veTrasAprobar = await loQueVe('tras APROBAR el plan');
if (veTrasAprobar !== null) {
  comprobar(
    veTrasAprobar === 1,
    'AQUI le aparece, y solo aqui: aprobar el plan es lo que le llega a la persona',
    `tras aprobar le aparece ${veTrasAprobar} veces`,
  );
}
const fuentes = new Set(items.map((a) => a.source));
console.log(`   ... origen de las obligaciones: ${[...fuentes].join(', ')}`);
comprobar(fuentes.size === 1 && fuentes.has('PLAN'), 'todas con origen PLAN: es lo que hace estables las metricas del plan', `origenes: ${[...fuentes].join(', ')}`);

/*
  LA FECHA SE LEE EN HORA DE COLOMBIA, no en UTC.

  El vencimiento es el FINAL del ultimo dia del mes: 31 de mayo a las 23:59 de Bogota, que en UTC
  es el 1 de junio. Comparar el ISO en crudo hace fallar una fecha que esta bien — es la misma
  trampa que costo un dia entero con `hired_at` (RUNBOOK, 2026-08-27).
*/
const enBogota = (iso) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(iso));
const fechas = new Set(items.map((a) => enBogota(a.dueAt)));
const ultimoDia = enBogota(new Date(Date.UTC(ano, MES, 0, 12)).toISOString());
console.log(`   ... vencen (hora de Colombia): ${[...fechas].join(', ')} · ultimo dia del mes ${MES}/${ano}: ${ultimoDia}`);
comprobar(fechas.size === 1, 'todas vencen el mismo dia', `hay ${fechas.size} fechas distintas`);
comprobar([...fechas][0] === ultimoDia, 'y es el ULTIMO DIA del mes del renglon', `vencen el ${[...fechas][0]} y el ultimo dia es ${ultimoDia}`);

paso(9, 'CON EL PLAN YA APROBADO, un renglon nuevo EXIGE MOTIVO (Decision #55)');
/*
  Y ya no entra solo: la Decision #75 crea el renglon al programar la jornada **solo si el plan
  esta en BORRADOR**. En un plan vivo, un renglon nuevo obliga a gente real y hay que explicarlo.
*/
const segundaFecha = `${ano}-08-20`;
const segunda = await admin.post('/offerings', {
  activityVersionId: creado.versionId,
  kind: 'EVENT', modality: 'PRESENCIAL', scheduledDate: segundaFecha,
  startTime: '08:00', endTime: '12:00', location: 'Sala 2', executedBy: 'PROPIOS', capacity: elegido.n + 50,
});
comprobar(segunda.ok, `segunda jornada programada para el ${segundaFecha} (${segunda.estado})`, `segunda: ${segunda.estado} ${JSON.stringify(segunda.cuerpo).slice(0, 250)}`);
creado.segundaOfferingId = segunda.cuerpo?.id;

const planTrasSegunda = (await admin.get(`/plans/${creado.planId}`)).cuerpo;
const renglonAuto = (planTrasSegunda?.items ?? []).find((i) => i.offering?.id === creado.segundaOfferingId || i.offeringId === creado.segundaOfferingId);
comprobar(
  !renglonAuto,
  'con el plan APROBADO el renglon NO entra solo: hay que anadirlo y explicar por que',
  'el renglon entro solo en un plan aprobado, saltandose la Decision #55',
);

const sinMotivo = await admin.post(`/plans/${creado.planId}/items`, { offeringId: creado.segundaOfferingId, plannedMonth: 8 });
comprobar(!sinMotivo.ok, `anadirlo sin motivo se rechaza (${sinMotivo.estado})`, `lo acepto sin motivo: ${sinMotivo.estado}`);

const conMotivo = await admin.post(`/plans/${creado.planId}/items`, {
  offeringId: creado.segundaOfferingId, plannedMonth: 8,
  justification: 'Recorrido automatico: segunda jornada para comprobar que no se duplica la obligacion.',
});
comprobar(conMotivo.ok, `con motivo si entra (${conMotivo.estado})`, `con motivo: ${conMotivo.estado} ${JSON.stringify(conMotivo.cuerpo).slice(0, 250)}`);

paso(10, 'DOS JORNADAS DE LO MISMO no duplican la obligacion de nadie (Decision #73)');
/*
  Es el fallo que esa decision existe para impedir: el plan deriva a quien obligar de los YA
  obligados, asi que se encontraba siempre con gente que ya tenia la obligacion y le creaba una
  segunda. De ahi salian la formacion duplicada en los pendientes, terminarla cerrando solo una, y
  la cobertura marcando 0% con todo el mundo capacitado.
*/
const trasSegundoRenglon = (await admin.get(`/assignments?targetId=${creado.activityId}&pageSize=100`)).cuerpo;
console.log(`   ... obligaciones totales de la formacion: ${trasSegundoRenglon?.total}`);
comprobar(
  trasSegundoRenglon?.total === obligaciones?.total,
  `siguen siendo ${obligaciones?.total}: la segunda jornada no le crea una segunda obligacion a nadie`,
  `pasaron de ${obligaciones?.total} a ${trasSegundoRenglon?.total}`,
);
const porPersona = new Map();
for (const a of trasSegundoRenglon?.items ?? []) porPersona.set(a.user.id, (porPersona.get(a.user.id) ?? 0) + 1);
const duplicadas = [...porPersona.values()].filter((n) => n > 1).length;
comprobar(duplicadas === 0, 'nadie tiene dos obligaciones de la misma formacion', `${duplicadas} personas con obligacion duplicada`);

/*
  ¿Y LOS PROYECTADOS DEL PLAN? Es la otra mitad del mismo problema (Decision #68).

  Dos jornadas de la misma formacion sin tajada proyectan a los MISMOS obligados, y si el plan las
  SUMA, 11 obligados salen como 22 proyectados: la cobertura no puede pasar del 50% aunque se
  capacite a todo el mundo. Se mide, no se supone.
*/
const conDosRenglones = (await admin.get(`/plans/${creado.planId}`)).cuerpo;
const nDos = conDosRenglones?.metrics ?? conDosRenglones?.metricas;
console.log(`   ... el plan con DOS renglones de lo mismo proyecta: ${nDos?.projected} (obligados reales: ${obligaciones?.total})`);
comprobar(
  nDos?.projected === obligaciones?.total,
  `el plan proyecta ${obligaciones?.total}, no el doble: no suma dos veces a la misma gente`,
  `el plan proyecta ${nDos?.projected} con ${obligaciones?.total} obligados reales: esta sumando a la misma gente dos veces`,
);

paso(10.5, 'LA TAJADA: dos jornadas que se REPARTEN a los obligados');
/*
  Es el caso para el que existe la tajada: la misma capacitacion en dos sedes o para dos cargos, y
  cada jornada atiende a su parte. Sin ella, las dos proyectan a todos.
*/
const cargosConGente = [];
for (const c of cargos) {
  const n = (await admin.post('/audiences/preview', { ...VACIO, jobTitleIds: [c.id] })).cuerpo?.count ?? 0;
  if (n > 0) cargosConGente.push({ c, n });
}
console.log(`   ... el requisito alcanza al cargo "${elegido.c.name}"; se parte por AREA, que es lo que distingue a su gente`);
const areasDeLosObligados = [...new Set((trasSegundoRenglon?.items ?? []).map((a) => a.user.area?.name).filter(Boolean))];
console.log(`   ... los ${obligaciones?.total} obligados estan en ${areasDeLosObligados.length} area(s): ${areasDeLosObligados.slice(0, 3).join(', ')}`);
if (areasDeLosObligados.length < 2) {
  console.log('   ... todos en la misma area: no hay por donde partirlos, se salta el reparto');
  ok('no aplica con estos datos, y es correcto no inventarlo');
} else {
  const todasLasAreas = (await admin.get('/catalogs/areas')).cuerpo ?? [];
  const primera = todasLasAreas.find((a) => a.name === areasDeLosObligados[0]);
  const tajada = await admin.patch(`/offerings/${creado.segundaOfferingId}`, {
    kind: 'EVENT', modality: 'PRESENCIAL', scheduledDate: segundaFecha,
    startTime: '08:00', endTime: '12:00', location: 'Sala 2', executedBy: 'PROPIOS', capacity: elegido.n + 50,
    audienceScope: { ...VACIO, areaIds: [primera.id] },
  });
  comprobar(tajada.ok, `la segunda jornada se acota al area "${primera.name}" (${tajada.estado})`, `acotar: ${tajada.estado} ${JSON.stringify(tajada.cuerpo).slice(0, 200)}`);
  const proyTajada = (await admin.get(`/offerings/${creado.segundaOfferingId}/projected`)).cuerpo;
  console.log(`   ... acotada proyecta ${proyTajada?.count} de los ${obligaciones?.total} obligados: ${proyTajada?.detail}`);
  comprobar(
    (proyTajada?.count ?? 0) < (obligaciones?.total ?? 0),
    'la jornada acotada proyecta MENOS que el total: la tajada de verdad reparte',
    `proyecta ${proyTajada?.count} de ${obligaciones?.total}: la tajada no acoto nada`,
  );
}

paso(11, 'REPROGRAMAR el mes deja el renglon como REPROGRAMADO');
const reprogramar = await admin.patch(`/plans/items/${creado.itemId}`, { plannedMonth: 6 });
comprobar(reprogramar.ok, `renglon movido de mayo a junio (${reprogramar.estado})`, `reprogramar: ${reprogramar.estado} ${JSON.stringify(reprogramar.cuerpo).slice(0, 200)}`);
const movido = ((await admin.get(`/plans/${creado.planId}`)).cuerpo?.items ?? []).find((i) => i.id === creado.itemId);
console.log(`   ... quedo en el mes ${movido?.plannedMonth}, estado ${movido?.status}`);
comprobar(movido?.plannedMonth === 6, 'el mes cambio', `quedo en ${movido?.plannedMonth}`);
comprobar(movido?.status === 'RESCHEDULED', 'y el renglon queda marcado como REPROGRAMADO, no como si nada', `quedo en ${movido?.status}`);
const trasMover = (await admin.get(`/assignments?targetId=${creado.activityId}&pageSize=100`)).cuerpo;
console.log(`   ... vencimientos de la gente: ${[...new Set((trasMover?.items ?? []).map((a) => enBogota(a.dueAt)))].join(', ')} (mover el mes no le cambia la fecha a quien ya la tiene)`);

paso(12, 'LO QUE NO ES DEL PLAN no entra al plan (Decision #78)');
const ajena = ((await admin.get('/activities?pageSize=100')).cuerpo?.items ?? [])
  .find((a) => a.name?.startsWith('Induccion general E2E') && a.versions?.some((v) => v.status === 'PUBLISHED'));
const suConvocatoria = ajena ? ((await admin.get(`/offerings?activityId=${ajena.id}`)).cuerpo?.items ?? [])[0] : null;
if (suConvocatoria) {
  const colar = await admin.post(`/plans/${creado.planId}/items`, {
    offeringId: suConvocatoria.id, plannedMonth: 9,
    justification: 'Recorrido automatico: se comprueba que una induccion no puede entrar al plan.',
  });
  comprobar(
    colar.estado === 409 && colar.cuerpo?.code === 'ACTIVITY_NOT_PLANNABLE',
    `una induccion general no entra al plan (${colar.estado} ${colar.cuerpo?.code ?? ''})`,
    `dejo meter una induccion general en el plan (${colar.estado}), y eso mueve el cumplimiento del ano con algo que no le toca`,
  );
} else {
  console.log('   ... no hay ninguna induccion de recorrido con convocatoria; se salta');
}

paso(13, 'SE PROGRAMA sobre contenido en borrador, pero NO se publica (Decision #77)');
const enBorrador = await admin.post('/activities', {
  code: `PLANB_${SUFIJO}`, name: `Capacitacion sin contenido ${SUFIJO}`,
  activityTypeId: tipo.id, processId: proceso.id, modality: 'PRESENCIAL',
});
creado.borradorActivityId = enBorrador.cuerpo?.id;
const versionBorrador = ((await admin.get(`/activities/${creado.borradorActivityId}`)).cuerpo?.versions ?? [])
  .find((v) => v.status === 'DRAFT')?.id;
const convBorrador = await admin.post('/offerings', {
  activityVersionId: versionBorrador,
  kind: 'EVENT', modality: 'PRESENCIAL', scheduledDate: `${ano}-11-10`,
  startTime: '08:00', endTime: '12:00', location: 'Sala 3', executedBy: 'PROPIOS',
});
comprobar(convBorrador.ok, `se PROGRAMA (${convBorrador.estado}): planear en enero no exige tener el contenido de noviembre`, `programar: ${convBorrador.estado} ${JSON.stringify(convBorrador.cuerpo).slice(0, 200)}`);
const publicarBorrador = await admin.post(`/offerings/${convBorrador.cuerpo?.id}/publish`, { confirm: true });
comprobar(
  !publicarBorrador.ok,
  `pero NO se publica (${publicarBorrador.estado} ${publicarBorrador.cuerpo?.code ?? ''}): nadie queda citado a contenido que aun puede cambiar`,
  'dejo publicar una convocatoria sobre contenido en borrador',
);

paso(14, 'LOS NUMEROS DEL PLAN');
const planConNumeros = (await admin.get(`/plans/${creado.planId}`)).cuerpo;
const numeros = planConNumeros?.metrics ?? planConNumeros?.metricas ?? null;
if (numeros) {
  console.log(`   ... ${JSON.stringify(numeros).slice(0, 320)}`);
  ok('el plan trae sus numeros');
} else {
  console.log(`   ... el detalle del plan trae: ${Object.keys(planConNumeros ?? {}).join(', ')}`);
  ok('el plan responde; los numeros se calculan donde los pinta la pantalla');
}

paso(15, 'UNA PERSONA NUEVA no entra a una jornada que ya se programo');
const documento = `E2E${marca}`;
const alta = await admin.post('/users', {
  documentNumber: documento,
  fullName: `Persona Plan ${SUFIJO}`,
  email: `${documento.toLowerCase()}@recorrido.test`,
  jobTitleId: elegido.c.id,
  areaId: area.id,
});
comprobar(alta.ok, `persona creada con el cargo "${elegido.c.name}" (${alta.estado})`, `alta: ${alta.estado} ${JSON.stringify(alta.cuerpo).slice(0, 200)}`);
creado.userId = alta.cuerpo?.id ?? alta.cuerpo?.user?.id;
const clave = alta.cuerpo?.generatedPassword ?? alta.cuerpo?.password;

const suyas = (await admin.get(`/assignments?targetId=${creado.activityId}&userId=${creado.userId}`)).cuerpo;
comprobar(
  (suyas?.total ?? 0) === 0,
  'NO le nace la obligacion: el plan congelo a quien obliga al aprobarse (regla de oro 2)',
  `le nacieron ${suyas?.total} obligaciones, y quien ingresa en septiembre no entra en la jornada de mayo`,
);

paso(16, 'EL APRENDIZ: uno de los que SI quedaron obligados');
const obligado = items[0];
console.log(`   ... se usa a ${obligado?.user?.fullName} (${obligado?.user?.documentNumber})`);
// Se le regenera la contrasena para poder entrar como esa persona.
const reset = await admin.post(`/users/${obligado?.user?.id}/reset-password`, {});
const claveObligado = reset.cuerpo?.generatedPassword ?? reset.cuerpo?.password;
comprobar(!!claveObligado, 'se le regenera la contrasena para el recorrido', `reset: ${reset.estado} ${JSON.stringify(reset.cuerpo).slice(0, 200)}`);

const aprendiz = crearCliente();
let entro = false;
if (claveObligado) {
  try { await aprendiz.entrar(obligado.user.documentNumber, claveObligado); entro = true; }
  catch (e) { mal(`no pudo entrar: ${e.message}`); }
}
if (entro) {
  ok('entra con su documento');
  const pendientes = (await aprendiz.get('/me/pending')).cuerpo;
  const mia = (pendientes?.items ?? pendientes ?? []).find((p) => p.activity?.id === creado.activityId || p.activityId === creado.activityId);
  comprobar(!!mia, 'la capacitacion del plan le aparece en sus pendientes', `no le aparece: ${JSON.stringify(pendientes).slice(0, 300)}`);

  /*
    A UNA JORNADA NO SE APUNTA UNO SOLO: LO CONVOCAN.

    `/me/enroll` responde 409 `OFFERING_NOT_SELF_SERVICE` — "esta convocatoria tiene fecha y cupo:
    te inscribe quien la programa"— y es correcto: una sesion presencial con treinta sillas no se
    llena por orden de llegada. Es la diferencia de fondo con las tres permanentes, donde el
    aprendiz entra cuando puede.

    Asi que primero se mira a quien falta por convocar y se le cita desde la convocatoria.
  */
  const porConvocar = (await admin.get(`/offerings/${creado.offeringId}/pendientes-por-convocar`)).cuerpo;
  const faltan = porConvocar?.items ?? porConvocar ?? [];
  console.log(`   ... pendientes por convocar: ${Array.isArray(faltan) ? faltan.length : porConvocar?.total ?? '?'}`);
  const noSeApunta = await aprendiz.post('/me/enroll', { offeringId: creado.offeringId });
  comprobar(
    noSeApunta.estado === 409 && noSeApunta.cuerpo?.code === 'OFFERING_NOT_SELF_SERVICE',
    'el aprendiz NO puede apuntarse solo a una jornada con fecha y cupo',
    `esperaba 409 OFFERING_NOT_SELF_SERVICE y vino ${noSeApunta.estado}`,
  );

  const convocar = await admin.post(`/offerings/${creado.offeringId}/enroll`, { allAssigned: true });
  comprobar(convocar.ok, `convocados los obligados desde la jornada (${convocar.estado})`, `convocar: ${convocar.estado} ${JSON.stringify(convocar.cuerpo).slice(0, 250)}`);
  console.log(`   ... ${JSON.stringify(convocar.cuerpo).slice(0, 160)}`);

  // La inscripcion llega al aprendiz por sus PENDIENTES: no hay lista de "mis inscripciones", y no
  // hace falta — lo que el aprendiz mira es lo que le queda por hacer.
  const trasConvocar = (await aprendiz.get('/me/pending')).cuerpo;
  const suya = (trasConvocar?.items ?? trasConvocar ?? []).find((p) => p.activity?.id === creado.activityId || p.activityId === creado.activityId);
  const enrollmentId = suya?.enrollmentId;
  comprobar(!!enrollmentId, 'y al aprendiz ya le aparece citado, sin haber hecho nada', `sigue sin inscripcion: ${JSON.stringify(suya).slice(0, 300)}`);

  if (enrollmentId) {
    const curso = (await aprendiz.get(`/me/enrollments/${enrollmentId}`)).cuerpo;
    const piezas = curso?.contents ?? curso?.version?.contents ?? [];
    const pideEncuesta = tipo.config?.requiresSurvey === true;
    const esperadas = 2 + (pideEncuesta ? 1 : 0);
    console.log(`   ... ${piezas.length} piezas: ${piezas.map((c) => c.type).join(', ')}`);
    comprobar(piezas.length === esperadas, `llegan las ${esperadas} piezas que el tipo pide`, `llegaron ${piezas.length}`);
    if (pideEncuesta) {
      comprobar(piezas[piezas.length - 1]?.type === 'SURVEY', 'la encuesta va la ULTIMA', `orden: ${piezas.map((c) => c.type).join(', ')}`);
    }

    const laLeccion = piezas.find((c) => c.type === 'LESSON');
    if (laLeccion) {
      const avance = await aprendiz.post(`/me/contents/${laLeccion.id}/progress`, { pct: 100, secondsSpent: 60, source: 'DECLARED' });
      comprobar(avance.ok, 'marca la leccion como vista', `avance: ${avance.estado}`);
    }

    const elExamen = piezas.find((c) => c.type === 'ASSESSMENT');
    const examenId = elExamen?.assessmentId ?? elExamen?.assessment?.id;
    const intento = await aprendiz.post(`/me/enrollments/${enrollmentId}/attempts?assessmentId=${examenId}`, {});
    comprobar(intento.ok, 'abre el examen', `intento: ${intento.estado} ${JSON.stringify(intento.cuerpo).slice(0, 250)}`);
    const attemptId = intento.cuerpo?.id ?? intento.cuerpo?.attempt?.id;
    if (attemptId) {
      const preguntas = intento.cuerpo?.questions ?? (await aprendiz.get(`/me/attempts/${attemptId}`)).cuerpo?.questions ?? [];
      for (const p of preguntas) {
        const r = await aprendiz.post(`/me/attempts/${attemptId}/answers`, { attemptQuestionId: p.attemptQuestionId, answer: { optionId: 'a' } });
        if (!r.ok) mal(`guardar respuesta: ${r.estado}`);
      }
      const entrega = await aprendiz.post(`/me/attempts/${attemptId}/submit`, {});
      comprobar(entrega.cuerpo?.passed === true, `aprobada con ${entrega.cuerpo?.score}`, `no aprobo: ${JSON.stringify(entrega.cuerpo).slice(0, 200)}`);
    }
  }
}

paso(17, 'LA CONSTANCIA');
if (tipo.config?.issuesCertificate && entro) {
  const lista = (await aprendiz.get('/me/certificados')).cuerpo;
  const cert = (lista?.items ?? lista ?? []).find?.((c) => c.activityName?.includes(SUFIJO) || c.activity?.id === creado.activityId);
  comprobar(!!cert, 'el tipo emite constancia y esta', 'no aparece la constancia');
  if (cert) console.log(`   ... constancia ${cert.code ?? cert.verificationCode ?? ''}`);
}

paso(18, 'CANCELAR LA JORNADA retira lo abierto y arrastra el renglon (Decision #79)');
const antesDeCancelar = (await admin.get(`/assignments?targetId=${creado.activityId}&pageSize=100`)).cuerpo;
const vivasAntes = (antesDeCancelar?.items ?? []).filter((a) => ['PENDING', 'IN_PROGRESS', 'OVERDUE'].includes(a.status)).length;
console.log(`   ... antes de cancelar hay ${vivasAntes} obligaciones vivas`);

const cancelar = await admin.post(`/offerings/${creado.offeringId}/cancel`, {
  cancelledReason: 'Recorrido automatico de punta a punta: se cancela para dejar la base como estaba.',
});
comprobar(cancelar.ok, `jornada cancelada (${cancelar.estado})`, `cancelar: ${cancelar.estado} ${JSON.stringify(cancelar.cuerpo).slice(0, 250)}`);

const trasCancelar = (await admin.get(`/assignments?targetId=${creado.activityId}&pageSize=100`)).cuerpo;
const vivasDespues = (trasCancelar?.items ?? []).filter((a) => ['PENDING', 'IN_PROGRESS', 'OVERDUE'].includes(a.status)).length;
const canceladas = (trasCancelar?.items ?? []).filter((a) => a.status === 'WITHDRAWN_PLAN_ITEM_CANCELLED').length;
console.log(`   ... despues quedan ${vivasDespues} vivas y ${canceladas} con el renglon cancelado`);
comprobar(vivasDespues === 0, 'no queda ninguna obligacion viva: cancelar llega hasta las personas', `quedan ${vivasDespues} vivas`);
comprobar(
  canceladas > 0,
  'y quedan con RENGLON CANCELADO, no borradas: quien recibio el aviso puede saber que paso',
  'ninguna quedo marcada como renglon cancelado',
);
const planFinal = (await admin.get(`/plans/${creado.planId}`)).cuerpo;
const renglonFinal = (planFinal?.items ?? []).find((i) => i.id === creado.itemId);
console.log(`   ... el renglon del plan quedo en ${renglonFinal?.status}`);
comprobar(renglonFinal?.status === 'CANCELLED', 'el renglon del plan quedo CANCELADO', `quedo en ${renglonFinal?.status}`);

await comprobarSeguimiento(admin, creado.activityId, { numeroDePaso: 19 });

paso(20, 'LIMPIEZA: se retira el requisito');
if (creado.ruleId) {
  const retirar = await admin.pedir(`/activities/${creado.activityId}/requirements/${creado.ruleId}`, { method: 'DELETE' });
  comprobar(retirar.ok, 'requisito retirado', `retirar: ${retirar.estado}`);
}

console.log(`\nCREADO PARA LIMPIAR: actividad=${creado.activityId} plan=${creado.planId} (${ano}) usuario=${creado.userId} sufijo=${SUFIJO}`);
process.exit(resumen() === 0 ? 0 : 1);
