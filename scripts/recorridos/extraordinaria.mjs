// RECORRIDO DE PUNTA A PUNTA: CAPACITACION EXTRAORDINARIA.
//
// La que no estaba planeada y hay que dar: cambio una norma, hubo un incidente, entro un cliente
// con una exigencia nueva. Tiene fecha y sesion como la del plan, pero **no cuelga del plan**.
//
// Lo que la distingue, y por eso este recorrido existe aparte:
//
//   1. NADA se dispara solo. `defaultAssignmentMode: MANUAL`: publicarla no exige a nadie y no abre
//      ninguna convocatoria. Las dos cosas las decide una persona, y esa es la definicion del tipo.
//   2. **No entra al plan.** `participatesInPlan: false`, asi que programar su jornada NO crea
//      renglon —al reves que la del plan, donde programar ES planear (Decision #75)— y engancharla
//      a mano a un plan se rechaza (Decision #78).
//   3. El alcance lo declara el analista, con las facetas CRUZADAS: cargo + area son los de ese
//      cargo EN esa area, no la suma de los dos grupos.
//
// Cierra la lista: era el ultimo de los seis tipos sin recorrido.
import { crearCliente, paso, ok, mal, comprobar, resumen } from './api.mjs';
import { comprobarSeguimiento } from './seguimiento.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;
const creado = { activityId: null, versionId: null, lessonId: null, assessmentId: null, offeringId: null, userId: null, planId: null };

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

paso(1, 'EL TIPO: lo que promete, y sobre todo lo que NO hace solo');
const tipos = (await admin.get('/catalogs/activity-types')).cuerpo;
const tipo = tipos.find((t) => t.code === 'EXTRA');
comprobar(!!tipo, 'tipo "Capacitacion extraordinaria" existe', 'NO existe el tipo EXTRA');
if (!tipo) { resumen(); process.exit(1); }
console.log(`   ... examen=${tipo.config?.requiresAssessment} encuesta=${tipo.config?.requiresSurvey} constancia=${tipo.config?.issuesCertificate}`);
console.log(`   ... asignacion=${tipo.config?.defaultAssignmentMode} convocatoria=${tipo.config?.defaultOfferingKind} entraAlPlan=${tipo.config?.participatesInPlan ?? false}`);
comprobar(
  tipo.config?.defaultAssignmentMode === 'MANUAL',
  'a quien se le exige lo marca una persona: no hay automatismo',
  `modo de asignacion inesperado: ${tipo.config?.defaultAssignmentMode}`,
);
comprobar(
  tipo.config?.defaultOfferingKind === 'EVENT',
  'la convocatoria es de EVENTO: tiene fecha, no esta siempre abierta',
  `tipo de convocatoria: ${tipo.config?.defaultOfferingKind}`,
);
comprobar(
  tipo.config?.participatesInPlan !== true,
  'y NO participa del plan: es justo lo contrario de la capacitacion del plan',
  'el tipo dice que participa del plan, y entonces moveria el cumplimiento del ano',
);

const procesos = (await admin.get('/catalogs/processes')).cuerpo;
const cargos = ((await admin.get('/catalogs/job-titles')).cuerpo ?? []).filter((c) => c.active);
const areas = ((await admin.get('/catalogs/areas')).cuerpo ?? []).filter((a) => a.active);
const proceso = procesos.find((p) => p.active) ?? procesos[0];
const cargo = cargos[0];
const area = areas[0];

paso(2, 'LA FICHA');
const ficha = await admin.post('/activities', {
  code: `EXTRA_${SUFIJO}`,
  name: `Cambio normativo ${SUFIJO}`,
  description: 'Capacitacion extraordinaria: recorrido automatico de punta a punta.',
  activityTypeId: tipo.id,
  processId: proceso.id,
  modality: 'PRESENCIAL',
});
comprobar(ficha.ok, `ficha creada (${ficha.estado})`, `ficha: ${ficha.estado} ${JSON.stringify(ficha.cuerpo)}`);
creado.activityId = ficha.cuerpo?.id;
if (!creado.activityId) { resumen(); process.exit(1); }
creado.versionId = ((await admin.get(`/activities/${creado.activityId}`)).cuerpo?.versions ?? [])
  .find((v) => v.status === 'DRAFT')?.id;
comprobar(!!creado.versionId, 'nace con una version en BORRADOR', 'no nacio version en borrador');

paso(3, 'CONTENIDO Y EXAMEN');
const leccion = await admin.post('/lessons', { title: `Lo que cambio ${SUFIJO}`, estimatedMinutes: 5 });
creado.lessonId = leccion.cuerpo?.id;
await admin.pedir(`/lessons/${creado.lessonId}/cards`, { method: 'PUT', body: JSON.stringify({
  cards: [
    { payload: { cardType: 'TEXT_IMAGE', title: 'La norma nueva', body: 'Que cambia y desde cuando.' } },
    { payload: { cardType: 'TEXT_IMAGE', title: 'Que hacemos distinto', body: 'El procedimiento actualizado.' } },
  ],
}) });
const contLeccion = await admin.post(`/activities/versions/${creado.versionId}/contents`, {
  type: 'LESSON', title: 'Lo que cambio', isRequired: true, config: { minSeconds: 1 }, lessonId: creado.lessonId,
});
comprobar(contLeccion.ok, 'la leccion entra como contenido', `contenido: ${contLeccion.estado}`);

const pregunta = await admin.post('/questions', {
  payload: {
    qtype: 'SINGLE',
    stem: 'Desde cuando aplica el procedimiento nuevo...',
    options: [{ id: 'a', text: 'Desde su publicacion' }, { id: 'b', text: 'El ano que viene' }],
    correctOptionId: 'a',
    points: 1,
  },
});
const examen = await admin.post('/assessments', { title: `Examen extraordinaria ${SUFIJO}` });
creado.assessmentId = examen.cuerpo?.id;
await admin.patch(`/assessments/${creado.assessmentId}`, {
  passingScore: 80, maxAttempts: 3, sections: [{ mode: 'FIXED', questionIds: [pregunta.cuerpo?.id] }],
});
const contExamen = await admin.post(`/activities/versions/${creado.versionId}/contents`, {
  type: 'ASSESSMENT', title: 'Examen', isRequired: true, config: {}, assessmentId: creado.assessmentId,
});
comprobar(contExamen.ok, 'el examen entra como contenido', `contenido examen: ${contExamen.estado}`);

paso(4, 'PUBLICAR: y aqui NO pasa nada solo, que es lo que define al tipo');
const publicada = await admin.post(`/activities/versions/${creado.versionId}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
comprobar(publicada.ok, `publicada (${publicada.estado})`, `publicar: ${publicada.estado} ${JSON.stringify(publicada.cuerpo).slice(0, 300)}`);

const requisitos = (await admin.get(`/activities/${creado.activityId}/requirements`)).cuerpo ?? [];
comprobar(
  requisitos.length === 0,
  'NO nacio ningun requisito: publicar no exige nada a nadie',
  `nacieron ${requisitos.length} requisitos, y con MANUAL no deberia nacer ninguno`,
);
const trasPublicar = (await admin.get(`/offerings?activityId=${creado.activityId}`)).cuerpo;
const convocatoriasIniciales = (trasPublicar?.items ?? trasPublicar ?? []);
comprobar(
  convocatoriasIniciales.length === 0,
  'NI ninguna convocatoria: la jornada tiene fecha, y la fecha la pone una persona',
  `se abrieron ${convocatoriasIniciales.length} convocatorias solas`,
);

paso(5, 'EL ALCANCE, declarado a mano: las facetas se CRUZAN, no se suman');
/*
  Es la trampa clasica de un filtro por varias facetas. "Auxiliares logisticos DE Antioquia" tiene
  que dar los que cumplen LAS DOS cosas; si se sumaran, la formacion le caeria a cientos de personas
  que nadie quiso obligar, y quien la creo no se enteraria hasta que llegaran las quejas.
*/
const soloCargo = (await admin.post('/audiences/preview', { match: 'ALL', jobTitleIds: [cargo.id] })).cuerpo?.count ?? 0;
const soloArea = (await admin.post('/audiences/preview', { match: 'ALL', areaIds: [area.id] })).cuerpo?.count ?? 0;
const cruzado = (await admin.post('/audiences/preview', { match: 'ALL', jobTitleIds: [cargo.id], areaIds: [area.id] })).cuerpo?.count ?? 0;
console.log(`   ... cargo "${cargo.name}": ${soloCargo} · area "${area.name}": ${soloArea} · las dos a la vez: ${cruzado}`);
comprobar(
  cruzado <= Math.min(soloCargo, soloArea),
  'cargo + area da los que cumplen LAS DOS, no la suma de los dos grupos',
  `cruzar dio ${cruzado}, que es mas que el menor de los dos grupos (${Math.min(soloCargo, soloArea)}): se estan sumando`,
);

paso(6, 'PROGRAMAR LA JORNADA: fecha, lugar e instructor, y NINGUN renglon de plan');
const hoy = new Date();
const fecha = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() + 7)).toISOString().slice(0, 10);
const convocatoria = await admin.post('/offerings', {
  activityVersionId: creado.versionId,
  kind: 'EVENT',
  modality: 'PRESENCIAL',
  scheduledDate: fecha,
  startTime: '08:00',
  endTime: '10:00',
  location: 'Sala de capacitacion, sede principal',
  executedBy: 'PROPIOS',
  capacity: 40,
  intensityTheoryHours: 2,
});
comprobar(convocatoria.ok, `jornada programada para el ${fecha} (${convocatoria.estado})`, `convocatoria: ${convocatoria.estado} ${JSON.stringify(convocatoria.cuerpo).slice(0, 300)}`);
creado.offeringId = convocatoria.cuerpo?.id;

/*
  LA DIFERENCIA CON LA DEL PLAN, EN UNA LINEA. Alli programar la jornada CREA el renglon del ano
  (Decision #75). Aqui no puede: `participatesInPlan: false`, y un renglon nuevo moveria el
  cumplimiento del plan con algo que por la regla de oro 2 no debe tocarlo.
*/
const planesAhora = (await admin.get('/plans')).cuerpo ?? [];
const conRenglon = [];
for (const p of (planesAhora.items ?? planesAhora)) {
  const detalle = (await admin.get(`/plans/${p.id}`)).cuerpo;
  if ((detalle?.items ?? []).some((i) => (i.offering?.id ?? i.offeringId) === creado.offeringId)) conRenglon.push(p.year);
}
comprobar(
  conRenglon.length === 0,
  'programarla NO creo ningun renglon de plan: al reves que la capacitacion del plan',
  `aparecio como renglon en el plan de ${conRenglon.join(', ')}`,
);

const publicarConv = await admin.post(`/offerings/${creado.offeringId}/publish`, { confirm: true });
comprobar(publicarConv.ok, `jornada publicada (${publicarConv.estado})`, `publicar jornada: ${publicarConv.estado} ${JSON.stringify(publicarConv.cuerpo).slice(0, 250)}`);

paso(7, 'Y NO SE DEJA COLAR EN UN PLAN, ni por la API (Decision #78)');
const anosOcupados = new Set((planesAhora.items ?? planesAhora).map((p) => p.year));
let ano = 2040;
while (anosOcupados.has(ano)) ano += 1;
const plan = await admin.post('/plans', { year: ano, name: `Plan tapadera ${ano} ${SUFIJO}` });
creado.planId = plan.cuerpo?.id;
comprobar(plan.ok, `plan de ${ano} creado en BORRADOR para intentarlo`, `plan: ${plan.estado} ${JSON.stringify(plan.cuerpo).slice(0, 200)}`);
if (creado.planId) {
  const colar = await admin.post(`/plans/${creado.planId}/items`, { offeringId: creado.offeringId, plannedMonth: 6 });
  comprobar(
    colar.estado === 409 && colar.cuerpo?.code === 'ACTIVITY_NOT_PLANNABLE',
    'el servidor la rechaza: una extraordinaria no entra al plan',
    `dejo meterla (${colar.estado} ${colar.cuerpo?.code ?? ''}), y eso mueve el cumplimiento del ano con algo que no le toca`,
  );
  // El motivo viaja en `title`: el filtro global mueve alli el `message` de la excepcion y no
  // reenvia `message` crudo (`global-exception.filter.ts`). Leerlo por `message` da vacio.
  console.log(`   ... y lo dice con palabras: "${(colar.cuerpo?.title ?? '').slice(0, 130)}"`);
}

paso(8, 'A QUIEN SE LE EXIGE: la asignacion manual');
const documento = `EX${marca}`;
const alta = await admin.post('/users', {
  documentNumber: documento,
  fullName: `Persona Extraordinaria ${SUFIJO}`,
  email: `${documento.toLowerCase()}@recorrido.test`,
  jobTitleId: cargo.id,
  areaId: area.id,
});
comprobar(alta.ok, `persona creada (${alta.estado})`, `alta: ${alta.estado} ${JSON.stringify(alta.cuerpo).slice(0, 200)}`);
creado.userId = alta.cuerpo?.id ?? alta.cuerpo?.user?.id;
const clave = alta.cuerpo?.generatedPassword ?? alta.cuerpo?.password;

const sinAsignar = (await admin.get(`/assignments?targetId=${creado.activityId}`)).cuerpo;
comprobar(
  (sinAsignar?.total ?? 0) === 0,
  'creada la persona, sigue sin deberla: aqui no hay motor que lo decida',
  `ya tiene ${sinAsignar?.total} obligaciones sin que nadie las pidiera`,
);

const asignar = await admin.post('/assignments', { targetId: creado.activityId, userIds: [creado.userId], dueAt: fecha });
comprobar(asignar.ok, `asignada a mano (${asignar.estado})`, `asignar: ${asignar.estado} ${JSON.stringify(asignar.cuerpo).slice(0, 250)}`);
const suya = (await admin.get(`/assignments?targetId=${creado.activityId}&userId=${creado.userId}`)).cuerpo;
const obligacion = (suya?.items ?? [])[0];
console.log(`   ... obligacion: origen=${obligacion?.source} estado=${obligacion?.status} vence ${(obligacion?.dueAt ?? '').slice(0, 10)}`);
comprobar(obligacion?.source === 'MANUAL', 'y queda marcada como MANUAL: se ve de donde salio', `origen ${obligacion?.source}`);

paso(9, 'EL APRENDIZ: la convocan, la cursa y la aprueba');
const aprendiz = crearCliente();
let entro = false;
try { await aprendiz.entrar(documento, clave); entro = true; } catch (e) { mal(`no pudo entrar: ${e.message}`); }
let enrollmentId = null;
if (entro) {
  ok('entra con su documento');

  // Con fecha y cupo no hay autoservicio: a la jornada la convoca quien la programa.
  const noSeApunta = await aprendiz.post('/me/enroll', { offeringId: creado.offeringId });
  comprobar(
    !noSeApunta.ok,
    'no se apunta solo a una jornada con fecha y cupo',
    `se apunto solo (${noSeApunta.estado}), y una jornada presencial con cupo no es autoservicio`,
  );

  const convocar = await admin.post(`/offerings/${creado.offeringId}/enroll`, { allAssigned: true });
  comprobar(convocar.ok, 'quien la programa convoca a los obligados', `convocar: ${convocar.estado} ${JSON.stringify(convocar.cuerpo).slice(0, 250)}`);

  const pendientes = (await aprendiz.get('/me/pending')).cuerpo;
  const mia = (pendientes?.items ?? pendientes ?? []).find((p) => p.activity?.id === creado.activityId || p.activityId === creado.activityId);
  enrollmentId = mia?.enrollmentId;
  comprobar(!!enrollmentId, 'y le aparece citado, sin haber hecho nada', `sigue sin inscripcion: ${JSON.stringify(mia).slice(0, 300)}`);
}

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
  comprobar(!!examenId && examenId !== creado.assessmentId, 'el examen viaja congelado', `no se congelo copia: ${examenId}`);
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

paso(10, 'LA CONSTANCIA');
if (tipo.config?.issuesCertificate && entro) {
  const lista = (await aprendiz.get('/me/certificados')).cuerpo;
  const items = lista?.items ?? lista ?? [];
  const suyaCert = items.find?.((c) => c.activityName?.includes(SUFIJO) || c.activity?.id === creado.activityId);
  comprobar(!!suyaCert, 'el tipo emite constancia y esta', `no aparece ninguna (${items.length ?? 0} en total)`);
  if (suyaCert) console.log(`   ... constancia ${suyaCert.code ?? suyaCert.verificationCode ?? ''}`);
} else if (!tipo.config?.issuesCertificate) {
  ok('el tipo no emite constancia');
}

paso(11, 'NO SE REPITE: una extraordinaria es de una vez');
const rondas = (await admin.get(`/assignments?targetId=${creado.activityId}&userId=${creado.userId}&pageSize=50`)).cuerpo;
const cuantas = (rondas?.items ?? []).length;
console.log(`   ... la persona tiene ${cuantas} ronda(s): ${(rondas?.items ?? []).map((a) => `#${a.cycleNumber} ${a.status}`).join(', ')}`);
comprobar(cuantas === 1, 'una sola ronda: no hay campana ni aniversario que la traiga de vuelta', `tiene ${cuantas} rondas`);

paso(12, 'Y NO MOVIO EL PLAN de ningun ano');
let renglonesTras = 0;
for (const p of (planesAhora.items ?? planesAhora)) {
  const detalle = (await admin.get(`/plans/${p.id}`)).cuerpo;
  renglonesTras += (detalle?.items ?? []).filter((i) => (i.offering?.id ?? i.offeringId) === creado.offeringId).length;
}
comprobar(renglonesTras === 0, 'terminada y certificada, sigue sin tocar ningun plan', `dejo ${renglonesTras} renglon(es) en algun plan`);

await comprobarSeguimiento(admin, creado.activityId, { numeroDePaso: 13, usuarioId: creado.userId, estadoEsperado: 'TERMINADA' });

paso(14, 'LIMPIEZA');
if (creado.planId) {
  const borrarPlan = await admin.pedir(`/plans/${creado.planId}`, {
    method: 'DELETE',
    body: JSON.stringify({ confirm: true, justification: 'Plan de prueba del recorrido de extraordinaria.' }),
  });
  comprobar(borrarPlan.ok, 'el plan tapadera se borra: estaba en borrador y vacio', `borrar plan: ${borrarPlan.estado}`);
}

console.log(`\nCREADO PARA LIMPIAR: actividad=${creado.activityId} usuario=${creado.userId} sufijo=${SUFIJO}`);
process.exit(resumen() === 0 ? 0 : 1);
