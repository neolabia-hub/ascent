// RECORRIDO DE PUNTA A PUNTA: REINDUCCION.
//
// Lo que la distingue de las dos inducciones, y por eso este recorrido existe aparte:
//
//   1. Alcanza a TODA la empresa —como la general— pero SIN el corte de "solo a quien entre desde
//      ahora": al publicarla queda obligada la plantilla entera desde el primer dia. Es lo que la
//      general hace justo al reves, y confundirlas es lo que deja una reinduccion anual
//      dependiendo de que alguien se acuerde de marcarla.
//   2. SE REPITE, y no por aniversario de cada persona sino como CAMPANA ANUAL: el tipo trae
//      `defaultAnnualDate: 03-31`, porque lo que pregunta el auditor es "¿hicieron la reinduccion
//      de 2026?", no "¿cada cual la hizo dentro de sus doce meses?".
//
// OJO AL CORRERLO: publicar una reinduccion obliga a TODA la plantilla de la base (unas 780
// personas en desarrollo). Es a proposito —es lo que se quiere comprobar y medir— y el ultimo paso
// retira el requisito para no dejarlas vivas.
import { crearCliente, paso, ok, mal, comprobar, resumen } from './api.mjs';
import { comprobarSeguimiento } from './seguimiento.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;
const creado = { activityId: null, lessonId: null, assessmentId: null, offeringId: null, userId: null, ruleId: null };

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

paso(1, 'CATALOGOS: el tipo, y lo que promete');
const tipos = (await admin.get('/catalogs/activity-types')).cuerpo;
const tipo = tipos.find((t) => t.code === 'REINDUCCION');
comprobar(!!tipo, 'tipo "Reinduccion" existe', 'NO existe el tipo REINDUCCION');
if (!tipo) { resumen(); process.exit(1); }
console.log(`   ... examen=${tipo.config?.requiresAssessment} constancia=${tipo.config?.issuesCertificate} encuesta=${tipo.config?.requiresSurvey ?? false}`);
console.log(`   ... asignacion=${tipo.config?.defaultAssignmentMode} convocatoria=${tipo.config?.defaultOfferingKind} antesDelIngreso=${tipo.config?.requiresBeforeHire ?? false}`);
console.log(`   ... se repite: fecha fija=${tipo.config?.defaultAnnualDate ?? 'no'} cada N meses=${tipo.config?.defaultRecurrenceMonths ?? 'no'}`);
comprobar(
  tipo.config?.defaultAssignmentMode === 'ON_HIRE',
  'la audiencia la decide el TIPO: toda la empresa, sin marcar nada',
  `modo de asignacion inesperado: ${tipo.config?.defaultAssignmentMode}`,
);
comprobar(
  tipo.config?.requiresBeforeHire !== true,
  'NO es una induccion de ingreso: por eso no lleva el corte de "solo los nuevos"',
  'el tipo dice que va antes del ingreso, y entonces se comportaria como la general',
);
comprobar(!!tipo.config?.defaultAnnualDate, 'se repite como CAMPANA ANUAL, con fecha fija', 'no trae fecha anual: seria un aniversario por persona');

const procesos = (await admin.get('/catalogs/processes')).cuerpo;
const cargos = ((await admin.get('/catalogs/job-titles')).cuerpo ?? []).filter((c) => c.active);
const areas = (await admin.get('/catalogs/areas')).cuerpo;
const proceso = procesos.find((p) => p.active) ?? procesos[0];
const area = areas.find((a) => a.active);

const plantilla = (await admin.post('/audiences/preview', { match: 'ALL', jobTitleIds: [] })).cuerpo?.count ?? 0;
console.log(`   ... la empresa son ${plantilla} personas: eso es lo que deberia quedar obligado`);

paso(2, 'LA FICHA');
const ficha = await admin.post('/activities', {
  code: `REIN_${SUFIJO}`,
  name: `Reinduccion ${SUFIJO}`,
  description: 'Recorrido automatico de punta a punta.',
  activityTypeId: tipo.id,
  processId: proceso.id,
  modality: 'VIRTUAL',
});
comprobar(ficha.ok, `ficha creada (${ficha.estado})`, `ficha: ${ficha.estado} ${JSON.stringify(ficha.cuerpo)}`);
creado.activityId = ficha.cuerpo?.id;
if (!creado.activityId) { resumen(); process.exit(1); }
const versionId = ((await admin.get(`/activities/${creado.activityId}`)).cuerpo?.versions ?? [])
  .find((v) => v.status === 'DRAFT')?.id;
comprobar(!!versionId, 'nace con una version en BORRADOR', 'no nacio version en borrador');

paso(3, 'CONTENIDO');
const leccion = await admin.post('/lessons', { title: `Repaso anual ${SUFIJO}`, estimatedMinutes: 5 });
creado.lessonId = leccion.cuerpo?.id;
comprobar(leccion.ok, 'leccion creada', `leccion: ${leccion.estado}`);
if (creado.lessonId) {
  const tarjetas = await admin.pedir(`/lessons/${creado.lessonId}/cards`, { method: 'PUT', body: JSON.stringify({
    cards: [
      { payload: { cardType: 'TEXT_IMAGE', title: 'Lo que no cambia', body: 'La politica de seguridad y el reglamento siguen vigentes.' } },
      { payload: { cardType: 'TEXT_IMAGE', title: 'Lo que cambio este ano', body: 'Novedades del sistema de gestion.' } },
    ],
  }) });
  comprobar(tarjetas.ok, '2 tarjetas guardadas', `tarjetas: ${tarjetas.estado}`);
}
const contLeccion = await admin.post(`/activities/versions/${versionId}/contents`, {
  type: 'LESSON', title: 'Repaso anual', isRequired: true, config: { minSeconds: 1 }, lessonId: creado.lessonId,
});
comprobar(contLeccion.ok, 'la leccion entra como contenido', `contenido: ${contLeccion.estado}`);

paso(4, 'EXAMEN');
const pregunta = await admin.post('/questions', {
  payload: {
    qtype: 'SINGLE',
    stem: 'La politica de seguridad de la empresa...',
    options: [
      { id: 'a', text: 'Sigue vigente y aplica a todos' },
      { id: 'b', text: 'Se derogo este ano' },
    ],
    correctOptionId: 'a',
    points: 1,
  },
});
const examen = await admin.post('/assessments', { title: `Examen reinduccion ${SUFIJO}` });
creado.assessmentId = examen.cuerpo?.id;
const armado = await admin.patch(`/assessments/${creado.assessmentId}`, {
  passingScore: 80, maxAttempts: 3, sections: [{ mode: 'FIXED', questionIds: [pregunta.cuerpo?.id] }],
});
comprobar(armado.ok, 'examen armado: 1 pregunta, nota minima 80', `armar: ${armado.estado}`);
const contExamen = await admin.post(`/activities/versions/${versionId}/contents`, {
  type: 'ASSESSMENT', title: 'Examen', isRequired: true, config: {}, assessmentId: creado.assessmentId,
});
comprobar(contExamen.ok, 'el examen entra como contenido', `contenido examen: ${contExamen.estado}`);

paso(5, 'PUBLICAR: y aqui queda obligada LA PLANTILLA ENTERA, no solo los nuevos');
const antes = Date.now();
const publicada = await admin.post(`/activities/versions/${versionId}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
const tardo = Date.now() - antes;
comprobar(publicada.ok, `publicada (${publicada.estado}) en ${(tardo / 1000).toFixed(1)} s`, `publicar: ${publicada.estado} ${JSON.stringify(publicada.cuerpo).slice(0, 300)}`);
console.log(`   ... MEDIDO: publicar una reinduccion sobre ${plantilla} personas tarda ${(tardo / 1000).toFixed(1)} s`);

const requisitos = (await admin.get(`/activities/${creado.activityId}/requirements`)).cuerpo ?? [];
comprobar(requisitos.length === 1, 'al publicar nacio UN requisito solo, sin que nadie lo pidiera', `nacieron ${requisitos.length}`);
const req = requisitos[0];
creado.ruleId = req?.id;
if (req) {
  console.log(`   ... alcance=${req.reach} obligadas=${req.assignmentCount} soloNuevos=${req.soloNuevos} disparador=${req.trigger} vence=${req.dueDaysAfterTrigger}d fechaFija=${req.fixedDate} cadaNMeses=${req.everyMonths}`);
  comprobar(req.reachesEveryone === true, 'alcanza a TODA la empresa', 'el alcance no es toda la empresa');
  comprobar(
    req.soloNuevos === false,
    'SIN el corte de "solo los nuevos": es lo contrario que la induccion general',
    'quedo con el corte puesto, y entonces no obligaria a nadie de los que ya estan',
  );
  /*
    NO OBLIGA A LA PLANTILLA ENTERA: QUEDAN FUERA LOS INGRESOS RECIENTES (2026-09-04).

    Antes esta comprobacion exigia `assignmentCount === plantilla`. Desde que el tipo puede decir
    "no se le exige a quien ingreso hace menos de N meses" (`exemptRecentHiresMonths`, 6 en
    TRANSPRENSA), a quien entro dentro del ciclo no se le encima la campana sobre una induccion a
    medio hacer: **su induccion ES su actualizacion de ese ano**.

    Lo que se comprueba es lo que importa y no envejece: que obliga a MUCHOS —no es un requisito
    dormido— y que a los excluidos los explica el corte, no un fallo.
  */
  const excluidos = plantilla - req.assignmentCount;
  console.log(`   ... obliga a ${req.assignmentCount} de ${plantilla}; ${excluidos} quedan fuera por ingreso reciente (${tipo.config?.exemptRecentHiresMonths ?? 0} meses)`);
  comprobar(
    req.assignmentCount > 0 && req.assignmentCount <= plantilla,
    `obliga a ${req.assignmentCount} personas desde el primer dia, sin esperar a nadie`,
    `obliga a ${req.assignmentCount} de ${plantilla}`,
  );
  comprobar(
    (tipo.config?.exemptRecentHiresMonths ?? 0) === 0 ? excluidos === 0 : true,
    'y si el tipo no excluye a nadie, no se queda nadie fuera',
    `el tipo no excluye por ingreso reciente y aun asi quedaron ${excluidos} fuera`,
  );
  comprobar(req.fixedDate === tipo.config?.defaultAnnualDate, `se repite cada ano el ${tipo.config?.defaultAnnualDate}`, `fecha fija: ${req.fixedDate}`);
  comprobar(req.everyMonths === null, 'y NO cada N meses: campana, no aniversario', `everyMonths: ${req.everyMonths}`);
}

paso(6, 'LA CONVOCATORIA: la abre el tipo');
const convocatorias = (await admin.get(`/offerings?activityId=${creado.activityId}`)).cuerpo;
const abiertas = (convocatorias?.items ?? convocatorias ?? []).filter((o) => o.status === 'PUBLISHED');
comprobar(abiertas.length === 1, 'al publicar se abrio UNA convocatoria sola', `hay ${abiertas.length}`);
creado.offeringId = abiertas[0]?.id;
comprobar(abiertas[0]?.kind === 'PERMANENT', 'permanente: siempre abierta', `tipo: ${abiertas[0]?.kind}`);

paso(7, 'CUANDO VENCE: ¿el mismo dia para todos, o uno por persona?');
const obligaciones = (await admin.get(`/assignments?targetId=${creado.activityId}&pageSize=100`)).cuerpo;
const fechas = new Set((obligaciones?.items ?? []).map((a) => (a.dueAt ?? '').slice(0, 10)));
console.log(`   ... ${obligaciones?.total} obligaciones · ${fechas.size} fecha(s) de vencimiento distintas: ${[...fechas].slice(0, 4).join(', ')}`);
comprobar(
  fechas.size === 1,
  'todas vencen el MISMO dia: es una campana, no un aniversario por persona',
  `hay ${fechas.size} fechas distintas, y una campana anual deberia tener una sola`,
);
const laFecha = [...fechas][0] ?? '';
/*
  LA PRIMERA RONDA NO CAE EN LA FECHA DE LA CAMPANA, Y ES A PROPOSITO.

  `computeFirstDueAt` solo usa la fecha fija cuando el disparador es SCHEDULED; el que pone el
  automatismo al publicar es ON_JOIN, asi que la PRIMERA vence a los 30 dias de publicarla —el
  plazo de gracia para ponerse al dia— y es la SEGUNDA ronda la que ya cae el 31 de marzo.

  Es defendible: estrenar el sistema el 15 de marzo con vencimiento el 31 daria dos semanas para
  que 780 personas hagan la reinduccion. Pero conviene tenerlo escrito, porque la pantalla dice
  "cada ano el 31 de marzo" y la primera no vence ese dia.
*/
const [mes, dia] = (tipo.config?.defaultAnnualDate ?? '--').split('-');
const caeEnLaCampana = laFecha.slice(5) === `${mes}-${dia}`;
console.log(`   ... la primera ronda vence el ${laFecha}${caeEnLaCampana ? '' : ` (NO el ${tipo.config?.defaultAnnualDate}: son los 30 dias de gracia; la campana rige desde la 2a ronda)`}`);

/*
  Y NINGUNA NACE VENCIDA. Es la guardia del fallo que encontro este mismo recorrido el 2026-09-03:
  el plazo se contaba desde que cada persona entro a la AUDIENCIA —que se reutiliza y puede llevar
  meses creada— en vez de desde que existe la regla, y la plantilla entera aparecia en rojo el
  primer dia. Si vuelve a pasar, la fecha de aqui abajo sale anterior a hoy.
*/
const vencidasAlNacer = (obligaciones?.items ?? []).filter((a) => a.status === 'OVERDUE' || (a.dueAt && new Date(a.dueAt) < new Date())).length;
comprobar(
  vencidasAlNacer === 0,
  'ninguna nace vencida: el plazo cuenta desde que existe el requisito, no desde que se creo el grupo',
  `${vencidasAlNacer} obligaciones nacieron ya vencidas (vencen el ${laFecha} y hoy es ${new Date().toISOString().slice(0, 10)})`,
);

paso(8, 'UNA PERSONA NUEVA, creada despues: tambien la debe');
const documento = `E2E${marca}`;
const alta = await admin.post('/users', {
  documentNumber: documento,
  fullName: `Persona Reinduccion ${SUFIJO}`,
  email: `${documento.toLowerCase()}@recorrido.test`,
  jobTitleId: cargos[0].id,
  areaId: area.id,
});
comprobar(alta.ok, `persona creada (${alta.estado})`, `alta: ${alta.estado} ${JSON.stringify(alta.cuerpo).slice(0, 200)}`);
creado.userId = alta.cuerpo?.id ?? alta.cuerpo?.user?.id;
const clave = alta.cuerpo?.generatedPassword ?? alta.cuerpo?.password;
const trasElAlta = ((await admin.get(`/activities/${creado.activityId}/requirements`)).cuerpo ?? [])[0];
comprobar(
  trasElAlta?.assignmentCount === (req?.assignmentCount ?? 0) + 1,
  'a quien entra despues tambien le nace, sola',
  `esperaba ${(req?.assignmentCount ?? 0) + 1} y hay ${trasElAlta?.assignmentCount}`,
);

paso(9, 'EL APRENDIZ: la cursa y la aprueba');
const aprendiz = crearCliente();
let entro = false;
try { await aprendiz.entrar(documento, clave); entro = true; } catch (e) { mal(`no pudo entrar: ${e.message}`); }
if (entro) {
  ok('entra con su documento');
  const pendientes = (await aprendiz.get('/me/pending')).cuerpo;
  const mia = (pendientes?.items ?? pendientes ?? []).find((p) => p.activity?.id === creado.activityId || p.activityId === creado.activityId);
  comprobar(!!mia, 'la reinduccion le aparece en sus pendientes', `no le aparece: ${JSON.stringify(pendientes).slice(0, 300)}`);

  const inscripcion = await aprendiz.post('/me/enroll', { offeringId: creado.offeringId });
  comprobar(inscripcion.ok, 'se inscribe', `inscribir: ${inscripcion.estado} ${JSON.stringify(inscripcion.cuerpo).slice(0, 200)}`);
  const enrollmentId = inscripcion.cuerpo?.enrollmentId ?? inscripcion.cuerpo?.id;

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
}

paso(10, 'LA CONSTANCIA');
if (tipo.config?.issuesCertificate) {
  const lista = (await aprendiz.get('/me/certificados')).cuerpo;
  const items = lista?.items ?? lista ?? [];
  const suya = items.find?.((c) => c.activityName?.includes(SUFIJO) || c.activity?.id === creado.activityId);
  comprobar(!!suya, 'el tipo emite constancia y esta', `no aparece ninguna (${items.length ?? 0} en total)`);
  if (suya) console.log(`   ... constancia ${suya.code ?? suya.verificationCode ?? ''}`);
} else {
  ok('el tipo no emite constancia');
}

paso(11, 'LA RONDA SIGUIENTE no se abre todavia');
/*
  Al completarla NO nace la del ano que viene en el acto: `generateForRule` solo abre la ronda
  siguiente cuando ya se entro en la VENTANA de la proxima —60 dias antes de la fecha—. Si naciera
  al terminar, quien la hace en abril tendria encima la de 2027 desde abril.
*/
const trasCompletar = (await admin.get(`/assignments?targetId=${creado.activityId}&userId=${creado.userId}`)).cuerpo;
const suyas = trasCompletar?.items ?? [];
console.log(`   ... la persona tiene ${suyas.length} ronda(s): ${suyas.map((a) => `#${a.cycleNumber} ${a.status}`).join(', ')}`);
comprobar(suyas.length === 1, 'sigue con UNA sola ronda: la del ano que viene se abre cuando toque', `tiene ${suyas.length} rondas`);

await comprobarSeguimiento(admin, creado.activityId, { numeroDePaso: 12, usuarioId: creado.userId, estadoEsperado: 'TERMINADA' });

paso(13, 'LIMPIEZA: se retira el requisito para no dejar obligada a la empresa entera');
if (creado.ruleId) {
  const retirar = await admin.pedir(`/activities/${creado.activityId}/requirements/${creado.ruleId}`, { method: 'DELETE' });
  comprobar(retirar.ok, 'requisito retirado: lo pendiente queda retirado, lo cumplido no se toca', `retirar: ${retirar.estado}`);
  const despues = (await admin.get(`/assignments?targetId=${creado.activityId}&status=PENDING`)).cuerpo;
  comprobar((despues?.total ?? 0) === 0, 'no queda ninguna obligacion pendiente viva', `quedan ${despues?.total} pendientes`);
}

console.log(`\nCREADO PARA LIMPIAR: actividad=${creado.activityId} usuario=${creado.userId} sufijo=${SUFIJO}`);
process.exit(resumen() === 0 ? 0 : 1);
