// RECORRIDO DE PUNTA A PUNTA: PILDORA (microaprendizaje).
//
// Es el tipo que se define por lo que NO hace, y por eso lo que hay que comprobar es lo contrario
// que en los demas: que de verdad **no** exige examen y **no** emite constancia.
//
// Un tipo que promete "sin examen" y luego exige uno bloquea al aprendiz sin explicacion; y uno que
// promete "sin constancia" y la emite mete papel en un expediente de cumplimiento que no le
// corresponde. Los dos fallos son silenciosos, que es la razon de este recorrido.
//
//   requiresAssessment: false   issuesCertificate: false
//   isMicro: true               defaultOfferingKind: PERMANENT
//   (sin defaultAssignmentMode -> MANUAL: a quien le llega lo marca una persona)
import { crearCliente, paso, ok, mal, comprobar, resumen } from './api.mjs';
import { comprobarSeguimiento } from './seguimiento.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;
const VACIO = { match: 'ALL', jobTitleIds: [], jobTitleTypeIds: [], areaIds: [], regionalIds: [], serviceIds: [], employmentTypes: [], roadActors: [] };
const creado = { activityId: null, versionId: null, lessonId: null, offeringId: null, userId: null, ruleId: null };

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

paso(1, 'EL TIPO: se define por lo que NO hace');
const tipos = (await admin.get('/catalogs/activity-types')).cuerpo;
const tipo = tipos.find((t) => t.config?.isMicro === true);
comprobar(!!tipo, `tipo de pildora: "${tipo?.name}" (${tipo?.code})`, 'no hay ningun tipo con isMicro');
if (!tipo) { resumen(); process.exit(1); }
console.log(`   ... examen=${tipo.config?.requiresAssessment} constancia=${tipo.config?.issuesCertificate} encuesta=${tipo.config?.requiresSurvey ?? false}`);
console.log(`   ... convocatoria=${tipo.config?.defaultOfferingKind} asignacion=${tipo.config?.defaultAssignmentMode ?? '(sin poner -> MANUAL)'} plan=${tipo.config?.participatesInPlan}`);
comprobar(tipo.config?.requiresAssessment === false, 'NO se evalua', `requiresAssessment: ${tipo.config?.requiresAssessment}`);
comprobar(tipo.config?.issuesCertificate === false, 'NO emite constancia', `issuesCertificate: ${tipo.config?.issuesCertificate}`);
comprobar(tipo.config?.participatesInPlan !== true, 'NO cuenta para el plan', 'dice que participa en el plan');

const procesos = (await admin.get('/catalogs/processes')).cuerpo;
const cargos = ((await admin.get('/catalogs/job-titles')).cuerpo ?? []).filter((c) => c.active);
const areas = (await admin.get('/catalogs/areas')).cuerpo;
const proceso = procesos.find((p) => p.active) ?? procesos[0];
const area = areas.find((a) => a.active);
let elegido = null;
for (const c of cargos) {
  const n = (await admin.post('/audiences/preview', { ...VACIO, jobTitleIds: [c.id] })).cuerpo?.count ?? 0;
  if (elegido === null || n < elegido.n) elegido = { c, n };
}
console.log(`   ... se le exigira al cargo "${elegido.c.name}" (${elegido.n} personas)`);

paso(2, 'LA FICHA y UNA SOLA LECCION: no hay mas que poner');
const ficha = await admin.post('/activities', {
  code: `PILD_${SUFIJO}`,
  name: `Pildora ${SUFIJO}`,
  description: 'Recorrido automatico de punta a punta.',
  activityTypeId: tipo.id,
  processId: proceso.id,
  modality: 'VIRTUAL',
});
comprobar(ficha.ok, `ficha creada (${ficha.estado})`, `ficha: ${ficha.estado} ${JSON.stringify(ficha.cuerpo).slice(0, 250)}`);
creado.activityId = ficha.cuerpo?.id;
if (!creado.activityId) { resumen(); process.exit(1); }
creado.versionId = ((await admin.get(`/activities/${creado.activityId}`)).cuerpo?.versions ?? []).find((v) => v.status === 'DRAFT')?.id;

const leccion = await admin.post('/lessons', { title: `Tres minutos ${SUFIJO}`, estimatedMinutes: 3 });
creado.lessonId = leccion.cuerpo?.id;
const tarjetas = await admin.pedir(`/lessons/${creado.lessonId}/cards`, { method: 'PUT', body: JSON.stringify({
  cards: [{ payload: { cardType: 'TEXT_IMAGE', title: 'Recuerda', body: 'El refuerzo puntual de esta semana.' } }],
}) });
comprobar(tarjetas.ok, '1 tarjeta guardada', `tarjetas: ${tarjetas.estado}`);
const contLeccion = await admin.post(`/activities/versions/${creado.versionId}/contents`, {
  type: 'LESSON', title: 'Tres minutos', isRequired: true, config: { minSeconds: 1 }, lessonId: creado.lessonId,
});
comprobar(contLeccion.ok, 'la leccion entra como contenido', `contenido: ${contLeccion.estado}`);

paso(3, 'PUBLICAR SIN EXAMEN: es la comprobacion de fondo');
/*
  En los otros cuatro tipos, publicar sin evaluacion se rechaza con "este tipo de formacion se
  evalua". Aqui NO debe: `requiresAssessment: false`. Si `loQueExigeElTipo` cayera del lado que
  protege —que es su defecto cuando el tipo esta mal configurado— una pildora no se podria publicar
  nunca, y el mensaje mandaria a agregar un examen que este tipo no tiene por que tener.
*/
const publicada = await admin.post(`/activities/versions/${creado.versionId}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
comprobar(publicada.ok, `publicada SIN examen (${publicada.estado})`, `publicar: ${publicada.estado} ${JSON.stringify(publicada.cuerpo).slice(0, 300)}`);

const convocatorias = ((await admin.get(`/offerings?activityId=${creado.activityId}`)).cuerpo?.items ?? []);
const abiertas = convocatorias.filter((o) => o.status === 'PUBLISHED');
comprobar(abiertas.length === 1, 'y se abrio sola una convocatoria permanente', `hay ${abiertas.length} publicadas de ${convocatorias.length}`);
creado.offeringId = abiertas[0]?.id;
comprobar(abiertas[0]?.kind === 'PERMANENT', 'permanente: se ve cuando la persona pueda', `tipo: ${abiertas[0]?.kind}`);

const requisitos = (await admin.get(`/activities/${creado.activityId}/requirements`)).cuerpo ?? [];
comprobar(requisitos.length === 0, 'publicar NO se la exige a nadie: a quien le llega lo marca una persona', `nacieron ${requisitos.length} requisitos`);

paso(4, 'A QUIEN LE LLEGA: se marca a mano');
const exigir = await admin.post(`/activities/${creado.activityId}/requirements`, {
  scope: { ...VACIO, jobTitleIds: [elegido.c.id] },
  trigger: 'ON_JOIN', dueDaysAfterTrigger: 30, soloNuevos: false,
});
comprobar(exigir.ok, `marcada para el cargo "${elegido.c.name}" (${exigir.estado})`, `exigir: ${exigir.estado} ${JSON.stringify(exigir.cuerpo).slice(0, 250)}`);
creado.ruleId = exigir.cuerpo?.ruleId;
const req = ((await admin.get(`/activities/${creado.activityId}/requirements`)).cuerpo ?? [])[0];
console.log(`   ... disparador=${req?.trigger} vence=${req?.dueDaysAfterTrigger}d obligadas=${req?.assignmentCount}`);
comprobar(req?.trigger === 'ON_JOIN', 'el disparador es el que se pidio: aqui el servidor no fuerza nada', `quedo en ${req?.trigger}`);
comprobar((req?.assignmentCount ?? 0) > 0, `obliga a ${req?.assignmentCount} personas desde ya`, 'no obligo a nadie');

paso(5, 'UNA PERSONA NUEVA tambien la recibe');
const documento = `E2E${marca}`;
const alta = await admin.post('/users', {
  documentNumber: documento, fullName: `Persona Pildora ${SUFIJO}`,
  email: `${documento.toLowerCase()}@recorrido.test`, jobTitleId: elegido.c.id, areaId: area.id,
});
comprobar(alta.ok, `persona creada (${alta.estado})`, `alta: ${alta.estado}`);
creado.userId = alta.cuerpo?.id ?? alta.cuerpo?.user?.id;
const clave = alta.cuerpo?.generatedPassword ?? alta.cuerpo?.password;
const suyas = (await admin.get(`/assignments?targetId=${creado.activityId}&userId=${creado.userId}`)).cuerpo;
comprobar(suyas?.total === 1, 'le nace la obligacion sola', `tiene ${suyas?.total}`);

paso(6, 'EL APRENDIZ: se la hace en tres minutos y SIN examen');
const aprendiz = crearCliente();
let entro = false;
try { await aprendiz.entrar(documento, clave); entro = true; } catch (e) { mal(`no pudo entrar: ${e.message}`); }
let enrollmentId = null;
if (entro) {
  ok('entra con su documento');
  const pendientes = (await aprendiz.get('/me/pending')).cuerpo;
  const mia = (pendientes?.items ?? pendientes ?? []).find((p) => p.activity?.id === creado.activityId || p.activityId === creado.activityId);
  comprobar(!!mia, 'la pildora le aparece en sus pendientes', `no le aparece: ${JSON.stringify(pendientes).slice(0, 300)}`);

  const inscripcion = await aprendiz.post('/me/enroll', { offeringId: creado.offeringId });
  comprobar(inscripcion.ok, 'se inscribe sola: es de autoservicio', `inscribir: ${inscripcion.estado} ${JSON.stringify(inscripcion.cuerpo).slice(0, 200)}`);
  enrollmentId = inscripcion.cuerpo?.enrollmentId ?? inscripcion.cuerpo?.id;

  if (enrollmentId) {
    const curso = (await aprendiz.get(`/me/enrollments/${enrollmentId}`)).cuerpo;
    const piezas = curso?.contents ?? curso?.version?.contents ?? [];
    const pideEncuesta = tipo.config?.requiresSurvey === true;
    const esperadas = 1 + (pideEncuesta ? 1 : 0);
    console.log(`   ... ${piezas.length} pieza(s): ${piezas.map((c) => c.type).join(', ')}`);
    comprobar(piezas.length === esperadas, `llega ${esperadas === 1 ? 'la unica pieza' : `las ${esperadas} piezas`} que el tipo pide`, `llegaron ${piezas.length}`);
    comprobar(
      !piezas.some((c) => c.type === 'ASSESSMENT'),
      'NO trae examen: es lo que el tipo prometia',
      'trajo un examen, y este tipo dice que no se evalua',
    );

    const laLeccion = piezas.find((c) => c.type === 'LESSON');
    const avance = await aprendiz.post(`/me/contents/${laLeccion?.id}/progress`, { pct: 100, secondsSpent: 60, source: 'DECLARED' });
    comprobar(avance.ok, 'marca la leccion como vista y con eso la termina', `avance: ${avance.estado} ${JSON.stringify(avance.cuerpo).slice(0, 200)}`);
  }
}

paso(7, 'SE DA POR CUMPLIDA sin nota, porque no hay nota que dar');
const trasHacerla = (await admin.get(`/assignments?targetId=${creado.activityId}&userId=${creado.userId}`)).cuerpo;
const estados = (trasHacerla?.items ?? []).map((a) => a.status);
console.log(`   ... su obligacion: ${estados.join(', ')}`);
comprobar(
  estados.length === 1 && estados[0] === 'COMPLETED',
  'queda CUMPLIDA con solo ver el contenido: sin examen no hay nada mas que hacer',
  `quedo en ${estados.join(', ')}`,
);
if (entro) {
  const pendientesFinal = (await aprendiz.get('/me/pending')).cuerpo;
  const sigue = (pendientesFinal?.items ?? pendientesFinal ?? []).filter((p) => p.activity?.id === creado.activityId || p.activityId === creado.activityId);
  comprobar(sigue.length === 0, 'y le desaparece de pendientes', `le sigue apareciendo ${sigue.length} veces`);
}

paso(8, 'Y NO EMITE CONSTANCIA: la otra mitad de lo que promete el tipo');
if (entro) {
  const lista = (await aprendiz.get('/me/certificados')).cuerpo;
  const items = lista?.items ?? lista ?? [];
  const suya = items.find?.((c) => c.activityName?.includes(SUFIJO) || c.activity?.id === creado.activityId);
  comprobar(
    !suya,
    'no aparece ninguna constancia de la pildora: un refuerzo de tres minutos no acredita nada',
    'emitio constancia, y este tipo dice que no acredita',
  );
  console.log(`   ... (tiene ${items.length ?? 0} constancias en total, de otras formaciones)`);
}

paso(9, 'NO ENTRA AL PLAN');
const planes = (await admin.get('/plans')).cuerpo;
const unPlan = (planes?.items ?? planes ?? []).find((p) => p.status !== 'CLOSED');
if (unPlan && creado.offeringId) {
  const colar = await admin.post(`/plans/${unPlan.id}/items`, {
    offeringId: creado.offeringId, plannedMonth: 6,
    justification: 'Recorrido automatico: se comprueba que una pildora no entra al plan.',
  });
  comprobar(
    colar.estado === 409 && colar.cuerpo?.code === 'ACTIVITY_NOT_PLANNABLE',
    `una pildora no entra al plan (${colar.estado} ${colar.cuerpo?.code ?? ''})`,
    `la dejo entrar (${colar.estado}), y eso mueve el cumplimiento del ano con un refuerzo de tres minutos`,
  );
} else {
  console.log('   ... no hay ningun plan abierto; se salta');
}

await comprobarSeguimiento(admin, creado.activityId, { numeroDePaso: 10, usuarioId: creado.userId, estadoEsperado: 'TERMINADA' });

paso(11, 'LIMPIEZA: se retira el requisito');
if (creado.ruleId) {
  const retirar = await admin.pedir(`/activities/${creado.activityId}/requirements/${creado.ruleId}`, { method: 'DELETE' });
  comprobar(retirar.ok, 'requisito retirado', `retirar: ${retirar.estado}`);
}

console.log(`\nCREADO PARA LIMPIAR: actividad=${creado.activityId} usuario=${creado.userId} sufijo=${SUFIJO}`);
process.exit(resumen() === 0 ? 0 : 1);
