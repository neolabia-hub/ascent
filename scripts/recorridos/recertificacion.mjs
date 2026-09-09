// RECORRIDO DE PUNTA A PUNTA: RECERTIFICACION.
//
// ─── QUE ES, Y POR QUE NO ES UNA INDUCCION ESPECIFICA QUE SE REPITE ───
//
// Las dos cuelgan del CARGO y usan el mismo motor, asi que tecnicamente bastaba con poner "cada N
// meses" en una especifica. Pero el TIPO es lo que lee el auditor, y "Induccion especifica:
// Montacargas" que vence cada año no es una induccion. Son dos preguntas distintas:
//
//   Induccion especifica  ->  "¿le hicieron la induccion del puesto cuando llego?" Hecho pasado.
//   Recertificacion       ->  "¿esta VIGENTE hoy su habilitacion?" Estado de HOY, que vence.
//
// ─── LO QUE ESTE RECORRIDO COMPRUEBA, Y QUE NINGUN OTRO MIRA ───
//
//   1. Cuelga del CARGO: quien entre mañana con ese cargo la debe sin que nadie se acuerde.
//   2. Vence por ANIVERSARIO de cada persona, no por campaña: dos personas certificadas en meses
//      distintos NO pueden vencer el mismo dia. Es lo unico que hace util al tipo, y lo que se
//      perderia si alguien lo metiera al plan (el servidor fuerza recurrencia nula ahi).
//   3. Emite CONSTANCIA: en una recertificacion la constancia no es un extra, ES el certificado.
//   4. Se dicta en JORNADA con fecha, y admite que la ejecute un TERCERO (la ARL, un externo) sin
//      que cambie de quien es el registro.
//   5. Y lo que dice el SEGUIMIENTO de todo eso.
import { crearCliente, paso, ok, mal, comprobar, resumen } from './api.mjs';
import { comprobarSeguimiento } from './seguimiento.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;
const creado = { activityId: null, versionId: null, offeringId: null, ruleId: null, userId: null };

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

paso(1, 'EL TIPO: lo que promete, y por que su configuracion es la que es');
const tipos = (await admin.get('/catalogs/activity-types')).cuerpo;
const tipo = tipos.find((t) => t.code === 'RECERTIFICACION');
comprobar(!!tipo, 'tipo "Recertificacion" existe', 'NO existe el tipo RECERTIFICACION');
if (!tipo) { resumen(); process.exit(1); }
const c = tipo.config ?? {};
console.log(`   ... examen=${c.requiresAssessment} encuesta=${c.requiresSurvey} constancia=${c.issuesCertificate}`);
console.log(`   ... a quien=${c.defaultAssignmentMode} convocatoria=${c.defaultOfferingKind} plan=${c.participatesInPlan ?? false} vuelve cada ${c.defaultRecurrenceMonths} meses`);

comprobar(c.issuesCertificate === true, 'emite constancia: en una recertificacion la constancia ES el certificado', 'no emite constancia');
comprobar(c.defaultAssignmentMode === 'BY_JOB_TITLE', 'cuelga del CARGO, como la induccion especifica', `modo: ${c.defaultAssignmentMode}`);
comprobar(
  Number(c.defaultRecurrenceMonths) > 0 && !c.defaultAnnualDate,
  `vuelve cada ${c.defaultRecurrenceMonths} meses (ANIVERSARIO), no en fecha fija`,
  'esta configurada como campaña anual, y un certificado vence el dia de cada persona',
);
/*
  ESTA ES LA COMPROBACION QUE PROTEGE AL TIPO ENTERO. El servidor fuerza recurrencia NULA a todo lo
  que participa del plan —la del año que viene es otro plan, no otra ronda—, asi que poner
  `participatesInPlan: true` aqui mataria el aniversario en silencio y el tipo dejaria de servir.
*/
comprobar(
  c.participatesInPlan !== true,
  'y NO participa del plan: si participara, el servidor le anularia la recurrencia',
  'participa del plan, y eso mata el aniversario: el servidor fuerza recurrencia nula',
);

const procesos = (await admin.get('/catalogs/processes')).cuerpo;
const proceso = procesos.find((p) => p.active) ?? procesos[0];
const cargos = ((await admin.get('/catalogs/job-titles')).cuerpo ?? []).filter((x) => x.active);
const areas = ((await admin.get('/catalogs/areas')).cuerpo ?? []).filter((x) => x.active);
const cargo = cargos[0];
const area = areas[0];

paso(2, 'LA FICHA, EL CONTENIDO Y EL EXAMEN');
const ficha = await admin.post('/activities', {
  code: `RECERT_${SUFIJO}`,
  name: `Operacion de montacargas ${SUFIJO}`,
  description: 'Habilitacion del puesto que caduca y hay que renovar.',
  activityTypeId: tipo.id, processId: proceso.id, modality: 'PRESENCIAL',
});
comprobar(ficha.ok, `ficha creada (${ficha.estado})`, `ficha: ${ficha.estado} ${JSON.stringify(ficha.cuerpo).slice(0, 250)}`);
creado.activityId = ficha.cuerpo?.id;
if (!creado.activityId) { resumen(); process.exit(1); }
creado.versionId = ((await admin.get(`/activities/${creado.activityId}`)).cuerpo?.versions ?? []).find((v) => v.status === 'DRAFT')?.id;

const leccion = await admin.post('/lessons', { title: `Manejo seguro ${SUFIJO}`, estimatedMinutes: 10 });
await admin.pedir(`/lessons/${leccion.cuerpo.id}/cards`, { method: 'PUT', body: JSON.stringify({
  cards: [{ payload: { cardType: 'TEXT_IMAGE', title: 'Antes de operar', body: 'Inspeccion previa del equipo.' } }],
}) });
const contLeccion = await admin.post(`/activities/versions/${creado.versionId}/contents`, {
  type: 'LESSON', title: 'Manejo seguro', isRequired: true, config: { minSeconds: 1 }, lessonId: leccion.cuerpo.id,
});
comprobar(contLeccion.ok, 'la leccion entra como contenido', `contenido: ${contLeccion.estado}`);

const pregunta = await admin.post('/questions', {
  payload: {
    qtype: 'SINGLE', stem: 'Antes de operar el montacargas...',
    options: [{ id: 'a', text: 'Se inspecciona el equipo' }, { id: 'b', text: 'Se arranca y ya' }],
    correctOptionId: 'a', points: 1,
  },
});
const examen = await admin.post('/assessments', { title: `Examen recertificacion ${SUFIJO}` });
await admin.patch(`/assessments/${examen.cuerpo.id}`, {
  passingScore: 80, maxAttempts: 3, sections: [{ mode: 'FIXED', questionIds: [pregunta.cuerpo?.id] }],
});
const contExamen = await admin.post(`/activities/versions/${creado.versionId}/contents`, {
  type: 'ASSESSMENT', title: 'Examen', isRequired: true, config: {}, assessmentId: examen.cuerpo.id,
});
comprobar(contExamen.ok, 'el examen entra como contenido', `contenido examen: ${contExamen.estado}`);

paso(3, 'PUBLICAR: no exige a nadie todavia, y no abre convocatoria');
const publicada = await admin.post(`/activities/versions/${creado.versionId}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
comprobar(publicada.ok, `publicada (${publicada.estado})`, `publicar: ${publicada.estado} ${JSON.stringify(publicada.cuerpo).slice(0, 250)}`);

const reqs0 = (await admin.get(`/activities/${creado.activityId}/requirements`)).cuerpo ?? [];
comprobar(reqs0.length === 0, 'no nace ningun requisito: los cargos los eliges tu', `nacieron ${reqs0.length}`);
const offs0 = ((await admin.get(`/offerings?activityId=${creado.activityId}`)).cuerpo?.items ?? []);
comprobar(offs0.length === 0, 'ni ninguna convocatoria: se dicta en jornada, y la fecha la pone una persona', `se abrieron ${offs0.length}`);

paso(4, 'EXIGIRLA AL CARGO, con el aniversario que dice el tipo');
const requisito = await admin.post(`/activities/${creado.activityId}/requirements`, {
  scope: { match: 'ALL', jobTitleIds: [cargo.id] },
  trigger: 'ON_JOIN',
  dueDaysAfterTrigger: 30,
  everyMonths: Number(tipo.config?.defaultRecurrenceMonths ?? 12),
  soloNuevos: true,
});
comprobar(requisito.ok, `exigida al cargo "${cargo.name}" (${requisito.estado})`, `requisito: ${requisito.estado} ${JSON.stringify(requisito.cuerpo).slice(0, 250)}`);
creado.ruleId = requisito.cuerpo?.id ?? requisito.cuerpo?.ruleId;
const req = ((await admin.get(`/activities/${creado.activityId}/requirements`)).cuerpo ?? [])[0];
console.log(`   ... alcance=${req?.reach} obligadas=${req?.assignmentCount} cadaNMeses=${req?.everyMonths} fechaFija=${req?.fixedDate}`);
comprobar(
  req?.everyMonths === Number(tipo.config?.defaultRecurrenceMonths ?? 12) && !req?.fixedDate,
  `la regla guarda el aniversario de ${req?.everyMonths} meses, y NO una fecha de campaña`,
  `everyMonths=${req?.everyMonths} fixedDate=${req?.fixedDate}`,
);

paso(5, 'DOS PERSONAS QUE ENTRAN EN MOMENTOS DISTINTOS');
/*
  Es LA comprobacion del tipo. Con una campaña, las dos venceran el mismo dia. Con aniversario, cada
  una vence contando desde SU momento — y por eso el certificado de quien se habilito en agosto no
  puede figurar vigente hasta marzo.
*/
const altaPersona = async (n) => {
  const doc = `RC${marca}${n}`;
  const r = await admin.post('/users', {
    documentNumber: doc, fullName: `Operario ${n} ${SUFIJO}`,
    email: `${doc.toLowerCase()}@recorrido.test`, jobTitleId: cargo.id, areaId: area.id,
  });
  return { ok: r.ok, id: r.cuerpo?.id ?? r.cuerpo?.user?.id, doc, clave: r.cuerpo?.generatedPassword ?? r.cuerpo?.password };
};
const p1 = await altaPersona(1);
comprobar(p1.ok, 'entra la primera persona con ese cargo', 'no se pudo crear la primera persona');
creado.userId = p1.id;
const p2 = await altaPersona(2);
comprobar(p2.ok, 'y despues la segunda', 'no se pudo crear la segunda persona');

const suyas = async (uid) => ((await admin.get(`/assignments?targetId=${creado.activityId}&userId=${uid}`)).cuerpo?.items ?? []);
const o1 = (await suyas(p1.id))[0];
const o2 = (await suyas(p2.id))[0];
console.log(`   ... la 1 vence ${(o1?.dueAt ?? '').slice(0, 10)} · la 2 vence ${(o2?.dueAt ?? '').slice(0, 10)}`);
comprobar(!!o1 && !!o2, 'a las dos les nace la obligacion solas, por su cargo', 'a alguna no le nacio');
comprobar(
  o1?.cycleNumber === 1 && o2?.cycleNumber === 1,
  'las dos empiezan en su ronda 1: cada quien lleva su propia cuenta',
  `rondas: ${o1?.cycleNumber} y ${o2?.cycleNumber}`,
);
/*
  Las dos vencen HOY+30 y esta bien: entraron con un segundo de diferencia, asi que su primer plazo
  arranca igual. Lo que diverge es la ronda SIGUIENTE, que se cuenta desde que cada quien COMPLETO
  la anterior — y eso es lo que hace que un certificado firmado en agosto no pueda figurar vigente
  hasta marzo. Que el ancla sea la fecha de completado y no una fecha comun se comprueba abajo, en
  la regla: `everyMonths` sin `fixedDate` es exactamente eso, y `computeNextCycleDueAt` lo cuenta
  desde `completedAt`. Probar la divergencia de verdad exigiria dos personas completandola con
  meses de diferencia, que es lo que hace `reinduccion-ciclos.mjs` comprimiendo la recurrencia.
*/
comprobar(
  req?.everyMonths > 0 && !req?.fixedDate,
  'y la ronda siguiente de cada una se contara desde que ELLA la complete, no desde una fecha comun',
  'la regla tiene fecha fija: entonces las dos venceran el mismo dia y deja de ser un certificado',
);

paso(6, 'LA JORNADA, dictada por un TERCERO');
const fecha = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const jornada = await admin.post('/offerings', {
  activityVersionId: creado.versionId, kind: 'EVENT', modality: 'PRESENCIAL',
  scheduledDate: fecha, startTime: '08:00', endTime: '16:00',
  location: `Patio de maniobras ${SUFIJO}`,
  // Lo normal en una recertificacion: la dicta la ARL o un tercero. El registro sigue siendo de la
  // empresa, y el vencimiento lo vigila ella.
  executedBy: 'ARL', executedByOther: 'ARL Sura',
  capacity: 20, intensityTheoryHours: 4, intensityPracticeHours: 4,
});
comprobar(jornada.ok, `jornada programada para el ${fecha}, dictada por un tercero (${jornada.estado})`, `jornada: ${jornada.estado} ${JSON.stringify(jornada.cuerpo).slice(0, 250)}`);
creado.offeringId = jornada.cuerpo?.id;
const detalle = (await admin.get(`/offerings/${creado.offeringId}`)).cuerpo;
comprobar(
  (detalle?.executedByOther ?? '').length > 0,
  `queda escrito quien la dicto: "${detalle?.executedByOther}"`,
  'no quedo registrado el tercero que la dicta',
);

const publicarJornada = await admin.post(`/offerings/${creado.offeringId}/publish`, { confirm: true });
comprobar(publicarJornada.ok, `jornada publicada (${publicarJornada.estado})`, `publicar jornada: ${publicarJornada.estado} ${JSON.stringify(publicarJornada.cuerpo).slice(0, 250)}`);

paso(7, 'EL OPERARIO: lo convocan, la cursa y saca su certificado');
const convocar = await admin.post(`/offerings/${creado.offeringId}/enroll`, { userIds: [p1.id] });
comprobar(convocar.ok, 'lo convoca quien programa la jornada', `convocar: ${convocar.estado} ${JSON.stringify(convocar.cuerpo).slice(0, 200)}`);

const aprendiz = crearCliente();
let entro = false;
try { await aprendiz.entrar(p1.doc, p1.clave); entro = true; } catch (e) { mal(`no pudo entrar: ${e.message}`); }
if (entro) {
  const pendientes = (await aprendiz.get('/me/pending')).cuerpo;
  const mia = (pendientes?.items ?? pendientes ?? []).find((x) => x.activity?.id === creado.activityId || x.activityId === creado.activityId);
  const enrollmentId = mia?.enrollmentId;
  comprobar(!!enrollmentId, 'le aparece citado sin haber hecho nada', `no le aparece: ${JSON.stringify(mia).slice(0, 250)}`);

  if (enrollmentId) {
    const curso = (await aprendiz.get(`/me/enrollments/${enrollmentId}`)).cuerpo;
    const piezas = curso?.contents ?? [];
    console.log(`   ... ${piezas.length} piezas: ${piezas.map((x) => x.type).join(', ')}`);
    const laLeccion = piezas.find((x) => x.type === 'LESSON');
    if (laLeccion) await aprendiz.post(`/me/contents/${laLeccion.id}/progress`, { pct: 100, secondsSpent: 60, source: 'DECLARED' });
    const elExamen = piezas.find((x) => x.type === 'ASSESSMENT');
    const examenId = elExamen?.assessmentId ?? elExamen?.assessment?.id;
    const intento = await aprendiz.post(`/me/enrollments/${enrollmentId}/attempts?assessmentId=${examenId}`, {});
    const attemptId = intento.cuerpo?.id ?? intento.cuerpo?.attempt?.id;
    if (attemptId) {
      const preguntas = intento.cuerpo?.questions ?? (await aprendiz.get(`/me/attempts/${attemptId}`)).cuerpo?.questions ?? [];
      for (const q of preguntas) {
        await aprendiz.post(`/me/attempts/${attemptId}/answers`, { attemptQuestionId: q.attemptQuestionId, answer: { optionId: 'a' } });
      }
      const entrega = await aprendiz.post(`/me/attempts/${attemptId}/submit`, {});
      comprobar(entrega.cuerpo?.passed === true, `aprobada con ${entrega.cuerpo?.score}`, `no aprobo: ${JSON.stringify(entrega.cuerpo).slice(0, 200)}`);
    }

    const lista = (await aprendiz.get('/me/certificados')).cuerpo;
    const items = lista?.items ?? lista ?? [];
    const suya = Array.isArray(items) ? items.find((x) => x.activityName?.includes(SUFIJO) || x.activity?.id === creado.activityId) : null;
    comprobar(!!suya, `el certificado esta: ${suya?.code ?? suya?.verificationCode ?? ''}`, 'no se emitio certificado, y en una recertificacion la constancia ES el certificado');
  }
}

paso(8, 'Y NO LE VUELVE A CAER HASTA SU ANIVERSARIO');
const trasCumplir = await suyas(p1.id);
console.log(`   ... tiene ${trasCumplir.length} obligacion(es): ${trasCumplir.map((a) => `#${a.cycleNumber} ${a.status}`).join(' · ')}`);
comprobar(
  trasCumplir.length === 1,
  'sigue con UNA sola: la del año que viene se abre 60 dias antes de su vencimiento, no al terminar',
  `tiene ${trasCumplir.length} obligaciones`,
);

paso(9, 'NO ENTRA AL PLAN, y es lo que protege el aniversario');
const planes = (await admin.get('/plans')).cuerpo ?? [];
const enBorrador = (planes.items ?? planes).find((p) => p.status === 'DRAFT');
if (!enBorrador) {
  ok('no hay plan en borrador con el que probarlo, y no se inventa');
} else {
  const colar = await admin.post(`/plans/${enBorrador.id}/items`, { offeringId: creado.offeringId, plannedMonth: 6 });
  comprobar(
    colar.estado === 409 && colar.cuerpo?.code === 'ACTIVITY_NOT_PLANNABLE',
    'el plan la rechaza: si entrara, el servidor le anularia el aniversario',
    `respondio ${colar.estado} ${colar.cuerpo?.code ?? ''}`,
  );
}

await comprobarSeguimiento(admin, creado.activityId, {
  numeroDePaso: 10,
  usuarioId: creado.userId,
  estadoEsperado: 'TERMINADA',
});

paso(11, 'LIMPIEZA');
const cancelar = await admin.post(`/offerings/${creado.offeringId}/cancel`, { cancelledReason: `Fin del recorrido ${SUFIJO}.` });
comprobar(cancelar.ok || cancelar.estado === 409, 'jornada cancelada', `cancelar: ${cancelar.estado}`);
if (creado.ruleId) {
  const retirar = await admin.pedir(`/activities/${creado.activityId}/requirements/${creado.ruleId}`, { method: 'DELETE' });
  comprobar(retirar.ok, 'requisito retirado', `retirar: ${retirar.estado}`);
}
const vivas = (await admin.get(`/assignments?targetId=${creado.activityId}&status=PENDING`)).cuerpo;
comprobar((vivas?.total ?? 0) === 0, 'no queda ninguna obligacion pendiente viva', `quedan ${vivas?.total} pendientes`);

console.log(`\nCREADO PARA LIMPIAR: actividad=${creado.activityId} sufijo=${SUFIJO}`);
process.exit(resumen() === 0 ? 0 : 1);
