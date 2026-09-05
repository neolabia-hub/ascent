// RECORRIDO DE PUNTA A PUNTA: INDUCCION ESPECIFICA.
//
// Lo que la distingue de la general (y por eso este recorrido existe aparte): el alcance NO es
// toda la empresa, son los CARGOS de la matriz. Publicar no exige nada a nadie — hay que marcar.
// Asi que aqui se comprueban tres cosas que en la general ni se plantean:
//
//   1. Publicar NO hace nacer ningun requisito (el tipo dice BY_JOB_TITLE, no ON_HIRE).
//   2. La matriz cargo x formacion abre con lo que ya hay puesto desde la ficha, y al reves:
//      son dos puertas al MISMO modelo, no dos registros paralelos.
//   3. Exigirla a un cargo no toca a los demas — comprobado desde el aprendiz, no solo contando.
import { crearCliente, paso, ok, mal, comprobar, resumen } from './api.mjs';
import { comprobarSeguimiento } from './seguimiento.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;
const creado = { activityId: null, lessonId: null, assessmentId: null, offeringId: null, userA: null, userB: null };

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

paso(1, 'CATALOGOS: el tipo, y DOS cargos (uno se exige, el otro es el testigo)');
const tipos = (await admin.get('/catalogs/activity-types')).cuerpo;
const tipo = tipos.find((t) => t.code === 'INDUCCION_ESPECIFICA');
comprobar(!!tipo, 'tipo "Induccion especifica" existe', 'NO existe el tipo INDUCCION_ESPECIFICA');
if (!tipo) { resumen(); process.exit(1); }
comprobar(
  tipo.config?.defaultAssignmentMode === 'BY_JOB_TITLE',
  'el tipo dice que la audiencia la deciden los CARGOS (BY_JOB_TITLE)',
  `modo de asignacion inesperado: ${tipo.config?.defaultAssignmentMode}`,
);
console.log(`   ... el tipo pide: examen=${tipo.config?.requiresAssessment} constancia=${tipo.config?.issuesCertificate} encuesta=${tipo.config?.requiresSurvey ?? false} convocatoria=${tipo.config?.defaultOfferingKind}`);

const procesos = (await admin.get('/catalogs/processes')).cuerpo;
const cargos = ((await admin.get('/catalogs/job-titles')).cuerpo ?? []).filter((c) => c.active);
const areas = (await admin.get('/catalogs/areas')).cuerpo;
const proceso = procesos.find((p) => p.active) ?? procesos[0];
const area = areas.find((a) => a.active);
comprobar(cargos.length >= 2, `${cargos.length} cargos activos: hay con que probar el "solo a este"`, 'hacen falta 2 cargos activos y no los hay');
if (cargos.length < 2) { resumen(); process.exit(1); }

/*
  QUE CARGOS SE ELIGEN, Y POR QUE NO DA IGUAL.

  El requisito nace SIN el corte de "solo a quien entre desde ahora" —que es como lo quiere
  TRANSPRENSA: la induccion la deben nuevos Y antiguos—, asi que al exigirla se le crea la
  obligacion a TODA la gente que ya tenga ese cargo. Con "Conductor" (408 personas en la base de
  desarrollo) eso son 408 asignaciones de mentira que alguien tendria que limpiar despues.

  Se eligen los DOS cargos menos poblados: el recorrido comprueba lo mismo y no engorda la base.
*/
const poblacion = new Map();
for (const cargo of cargos) {
  const previo = await admin.post('/audiences/preview', { match: 'ALL', jobTitleIds: [cargo.id] });
  poblacion.set(cargo.id, previo.cuerpo?.count ?? 0);
}
const porTamano = [...cargos].sort((a, b) => poblacion.get(a.id) - poblacion.get(b.id));
const cargoA = porTamano[0];
const cargoB = porTamano[1];
console.log(`   ... se exige a "${cargoA.name}" (${poblacion.get(cargoA.id)} personas hoy)`);
console.log(`   ... el testigo es "${cargoB.name}" (${poblacion.get(cargoB.id)} personas hoy)`);

paso(2, 'LA FICHA: crear la formacion');
const ficha = await admin.post('/activities', {
  code: `INDE_${SUFIJO}`,
  name: `Induccion especifica ${SUFIJO}`,
  description: 'Recorrido automatico de punta a punta.',
  activityTypeId: tipo.id,
  processId: proceso.id,
  modality: 'VIRTUAL',
});
comprobar(ficha.ok, `ficha creada (${ficha.estado})`, `no se pudo crear la ficha: ${ficha.estado} ${JSON.stringify(ficha.cuerpo)}`);
creado.activityId = ficha.cuerpo?.id;
if (!creado.activityId) { resumen(); process.exit(1); }
const versionId = ((await admin.get(`/activities/${creado.activityId}`)).cuerpo?.versions ?? [])
  .find((v) => v.status === 'DRAFT')?.id;
comprobar(!!versionId, 'la ficha nace con una version en BORRADOR', 'no nacio ninguna version en borrador');

paso(3, 'CONTENIDO: una leccion con tarjetas');
const leccion = await admin.post('/lessons', { title: `Tu puesto ${SUFIJO}`, estimatedMinutes: 5 });
comprobar(leccion.ok, 'leccion creada', `leccion: ${leccion.estado} ${JSON.stringify(leccion.cuerpo).slice(0, 200)}`);
creado.lessonId = leccion.cuerpo?.id;
if (creado.lessonId) {
  const tarjetas = await admin.pedir(`/lessons/${creado.lessonId}/cards`, { method: 'PUT', body: JSON.stringify({
    cards: [
      { payload: { cardType: 'TEXT_IMAGE', title: 'Tu puesto', body: 'Los riesgos propios de este cargo y como se controlan.' } },
      { payload: { cardType: 'TEXT_IMAGE', title: 'Tus elementos de proteccion', body: 'Cuales te corresponden y cuando se usan.' } },
    ],
  }) });
  comprobar(tarjetas.ok, '2 tarjetas guardadas', `tarjetas: ${tarjetas.estado} ${JSON.stringify(tarjetas.cuerpo).slice(0, 200)}`);
}
const contLeccion = await admin.post(`/activities/versions/${versionId}/contents`, {
  type: 'LESSON', title: 'Tu puesto', isRequired: true, config: { minSeconds: 1 }, lessonId: creado.lessonId,
});
comprobar(contLeccion.ok, 'la leccion entra como contenido de la version', `contenido: ${contLeccion.estado} ${JSON.stringify(contLeccion.cuerpo).slice(0, 200)}`);

paso(4, 'EXAMEN: el tipo lo exige, asi que la version lo lleva');
const pregunta = await admin.post('/questions', {
  payload: {
    qtype: 'SINGLE',
    stem: 'Los elementos de proteccion de tu cargo se usan...',
    options: [
      { id: 'a', text: 'Siempre que se hace la tarea' },
      { id: 'b', text: 'Solo cuando hay visita' },
    ],
    correctOptionId: 'a',
    points: 1,
  },
});
comprobar(pregunta.ok, 'pregunta creada', `pregunta: ${pregunta.estado} ${JSON.stringify(pregunta.cuerpo).slice(0, 200)}`);
const examen = await admin.post('/assessments', { title: `Examen especifica ${SUFIJO}` });
comprobar(examen.ok, 'examen creado', `examen: ${examen.estado} ${JSON.stringify(examen.cuerpo).slice(0, 200)}`);
creado.assessmentId = examen.cuerpo?.id;
const armado = await admin.patch(`/assessments/${creado.assessmentId}`, {
  passingScore: 80,
  maxAttempts: 3,
  sections: [{ mode: 'FIXED', questionIds: [pregunta.cuerpo?.id] }],
});
comprobar(armado.ok, 'examen armado: 1 pregunta fija, nota minima 80', `armar: ${armado.estado} ${JSON.stringify(armado.cuerpo).slice(0, 200)}`);
const contExamen = await admin.post(`/activities/versions/${versionId}/contents`, {
  type: 'ASSESSMENT', title: 'Examen', isRequired: true, config: {}, assessmentId: creado.assessmentId,
});
comprobar(contExamen.ok, 'el examen entra como contenido', `contenido examen: ${contExamen.estado} ${JSON.stringify(contExamen.cuerpo).slice(0, 200)}`);

paso(5, 'PUBLICAR: y aqui NO se exige sola (esto es lo que la diferencia de la general)');
const publicada = await admin.post(`/activities/versions/${versionId}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
comprobar(publicada.ok, `publicada (${publicada.estado})`, `publicar: ${publicada.estado} ${JSON.stringify(publicada.cuerpo).slice(0, 300)}`);

const trasPublicar = (await admin.get(`/activities/${creado.activityId}/requirements`)).cuerpo ?? [];
comprobar(
  trasPublicar.length === 0,
  'publicar NO exige nada a nadie: el alcance lo decide la matriz, y eso se marca',
  `nacieron ${trasPublicar.length} requisitos solos, y una especifica no debe exigirse a ciegas`,
);

// La convocatoria SI se abre sola: eso lo manda `defaultOfferingKind: PERMANENT`, igual que en la
// general. Son dos automatismos distintos y solo uno depende del cargo.
const convocatorias = (await admin.get(`/offerings?activityId=${creado.activityId}`)).cuerpo;
const abiertas = (convocatorias?.items ?? convocatorias ?? []).filter((o) => o.status === 'PUBLISHED');
comprobar(abiertas.length === 1, 'la convocatoria permanente si se abrio sola', `hay ${abiertas.length} convocatorias publicadas`);
creado.offeringId = abiertas[0]?.id;
comprobar(abiertas[0]?.kind === 'PERMANENT', 'es PERMANENTE: siempre abierta, sin fecha de sesion', `tipo de convocatoria: ${abiertas[0]?.kind}`);

paso(6, 'EL TESTIGO: una persona del OTRO cargo, creada antes de exigir nada');
const docB = `E2E${marca}B`;
const altaB = await admin.post('/users', {
  documentNumber: docB,
  fullName: `Testigo Otro Cargo ${SUFIJO}`,
  email: `${docB.toLowerCase()}@recorrido.test`,
  jobTitleId: cargoB.id,
  areaId: area.id,
});
comprobar(altaB.ok, `persona del cargo "${cargoB.name}" creada (${altaB.estado})`, `alta B: ${altaB.estado} ${JSON.stringify(altaB.cuerpo).slice(0, 200)}`);
creado.userB = altaB.cuerpo?.id ?? altaB.cuerpo?.user?.id;
const claveB = altaB.cuerpo?.generatedPassword ?? altaB.cuerpo?.password;

paso(7, 'EXIGIRLA A UN CARGO: el boton que la general no necesita');
const exigir = await admin.post(`/activities/${creado.activityId}/requirements`, {
  scope: { match: 'ALL', jobTitleIds: [cargoA.id] },
  trigger: 'ON_HIRE',
  dueDaysAfterTrigger: -1,
  // Vacio a proposito: TRANSPRENSA quiere que la induccion la deban nuevos Y antiguos.
  soloNuevos: false,
  reason: 'Recorrido automatico de punta a punta de la induccion especifica.',
});
comprobar(exigir.ok, `exigida al cargo "${cargoA.name}" (${exigir.estado})`, `exigir: ${exigir.estado} ${JSON.stringify(exigir.cuerpo).slice(0, 250)}`);
console.log(`   ... audiencia "${exigir.cuerpo?.audienceName}" · obligaciones nacidas de golpe: ${exigir.cuerpo?.created}`);
comprobar(
  exigir.cuerpo?.created === poblacion.get(cargoA.id),
  `sin el corte de "solo nuevos", obliga a los ${poblacion.get(cargoA.id)} que YA tienen el cargo`,
  `nacieron ${exigir.cuerpo?.created} obligaciones y en el cargo hay ${poblacion.get(cargoA.id)} personas`,
);

const requisitos = (await admin.get(`/activities/${creado.activityId}/requirements`)).cuerpo ?? [];
comprobar(requisitos.length === 1, 'la ficha muestra UN requisito', `hay ${requisitos.length} requisitos`);
const req = requisitos[0];
if (req) {
  comprobar(req.reachesEveryone === false, 'el alcance NO es toda la empresa', 'el alcance salio como "toda la empresa" y deberia ser por cargo');
  comprobar(
    req.scope?.jobTitleIds?.length === 1 && req.scope.jobTitleIds[0] === cargoA.id,
    'el formulario ABRE con el cargo ya marcado (no en blanco)',
    `el alcance guardado no es el cargo elegido: ${JSON.stringify(req.scope?.jobTitleIds)}`,
  );
  comprobar(req.trigger === 'ON_HIRE', 'se dispara con el INGRESO', `disparador inesperado: ${req.trigger}`);
  comprobar(req.dueDaysAfterTrigger === -1, 'vence ANTES del ingreso (D1072)', `vence a los ${req.dueDaysAfterTrigger} dias`);
  comprobar(req.soloNuevos === false, 'sin corte: tambien la deben los que ya estaban', 'quedo puesto el corte de "solo nuevos"');
}

paso(8, 'LA MATRIZ: la misma casilla, vista desde la otra puerta');
const matriz = (await admin.get('/assignment-rules/job-title-matrix')).cuerpo;
const casillas = (matriz?.cells ?? []).filter((c) => c.activityId === creado.activityId);
comprobar(
  casillas.length === 1 && casillas[0].jobTitleId === cargoA.id,
  'la matriz abre con la casilla del cargo ENCENDIDA: es el mismo requisito, no otro registro',
  `la matriz muestra ${casillas.length} casillas para esta formacion: ${JSON.stringify(casillas.map((c) => c.jobTitleId))}`,
);
comprobar(
  !casillas.some((c) => c.jobTitleId === cargoB.id),
  `el cargo "${cargoB.name}" sigue apagado: exigirla a uno no la exige a los demas`,
  'exigirla a un cargo encendio tambien la casilla de otro',
);

paso(9, 'LA PERSONA DEL CARGO, creada despues: la obligacion le nace sola');
const docA = `E2E${marca}A`;
const altaA = await admin.post('/users', {
  documentNumber: docA,
  fullName: `Persona Recorrido ${SUFIJO}`,
  email: `${docA.toLowerCase()}@recorrido.test`,
  jobTitleId: cargoA.id,
  areaId: area.id,
});
comprobar(altaA.ok, `persona del cargo "${cargoA.name}" creada (${altaA.estado})`, `alta A: ${altaA.estado} ${JSON.stringify(altaA.cuerpo).slice(0, 200)}`);
creado.userA = altaA.cuerpo?.id ?? altaA.cuerpo?.user?.id;
const claveA = altaA.cuerpo?.generatedPassword ?? altaA.cuerpo?.password;
comprobar(!!claveA, 'la contrasena se entrega UNA vez, al crearla', 'no vino ninguna contrasena generada');

const trasElAlta = ((await admin.get(`/activities/${creado.activityId}/requirements`)).cuerpo ?? [])[0];
const esperadasTrasElAlta = (exigir.cuerpo?.created ?? 0) + 1;
comprobar(
  trasElAlta?.assignmentCount === esperadasTrasElAlta,
  'a quien entra con ESE cargo le nace la obligacion sola',
  `esperaba ${esperadasTrasElAlta} obligaciones y hay ${trasElAlta?.assignmentCount}`,
);

paso(10, 'EL APRENDIZ DEL CARGO: entra, la cursa y la aprueba');
const aprendizA = crearCliente();
let entroA = false;
try { await aprendizA.entrar(docA, claveA); entroA = true; } catch (e) { mal(`no pudo entrar: ${e.message}`); }
if (entroA) {
  ok('entra con su documento y la contrasena generada');
  const pendientes = (await aprendizA.get('/me/pending')).cuerpo;
  const mia = (pendientes?.items ?? pendientes ?? []).find((p) => p.activity?.id === creado.activityId || p.activityId === creado.activityId);
  comprobar(!!mia, 'la induccion de su cargo le aparece en sus pendientes', `no le aparece: ${JSON.stringify(pendientes).slice(0, 300)}`);

  const inscripcion = await aprendizA.post('/me/enroll', { offeringId: creado.offeringId });
  comprobar(inscripcion.ok, 'se inscribe', `inscribir: ${inscripcion.estado} ${JSON.stringify(inscripcion.cuerpo).slice(0, 200)}`);
  const enrollmentId = inscripcion.cuerpo?.enrollmentId ?? inscripcion.cuerpo?.id;

  if (enrollmentId) {
    const curso = (await aprendizA.get(`/me/enrollments/${enrollmentId}`)).cuerpo;
    const piezas = curso?.contents ?? curso?.version?.contents ?? [];
    const pideEncuesta = tipo.config?.requiresSurvey === true;
    const esperadas = 2 + (pideEncuesta ? 1 : 0);
    console.log(`   ... la formacion trae ${piezas.length} piezas: ${piezas.map((c) => c.type).join(', ')}`);
    comprobar(piezas.length === esperadas, `llegan las ${esperadas} piezas que el tipo pide`, `llegaron ${piezas.length} y se esperaban ${esperadas}`);
    if (pideEncuesta) {
      comprobar(
        piezas[piezas.length - 1]?.type === 'SURVEY',
        'la encuesta va la ULTIMA: se opina despues de hacerla, no antes',
        `la encuesta no va al final: ${piezas.map((c) => c.type).join(', ')}`,
      );
    }

    const laLeccion = piezas.find((c) => c.type === 'LESSON');
    if (laLeccion) {
      const avance = await aprendizA.post(`/me/contents/${laLeccion.id}/progress`, { pct: 100, secondsSpent: 60, source: 'DECLARED' });
      comprobar(avance.ok, 'marca la leccion como vista', `avance: ${avance.estado} ${JSON.stringify(avance.cuerpo).slice(0, 200)}`);
    }

    // El examen que responde la gente es la COPIA CONGELADA que hizo la publicacion, no el
    // borrador que se edita: el id sale de la pieza de la version.
    const elExamen = piezas.find((c) => c.type === 'ASSESSMENT');
    const examenId = elExamen?.assessmentId ?? elExamen?.assessment?.id;
    comprobar(!!examenId && examenId !== creado.assessmentId, 'el examen viaja congelado (copia distinta del borrador)', `no se congelo copia: ${examenId} vs ${creado.assessmentId}`);
    const intento = await aprendizA.post(`/me/enrollments/${enrollmentId}/attempts?assessmentId=${examenId}`, {});
    comprobar(intento.ok, 'abre el examen', `intento: ${intento.estado} ${JSON.stringify(intento.cuerpo).slice(0, 250)}`);
    const attemptId = intento.cuerpo?.id ?? intento.cuerpo?.attempt?.id;
    if (attemptId) {
      const preguntas = intento.cuerpo?.questions ?? (await aprendizA.get(`/me/attempts/${attemptId}`)).cuerpo?.questions ?? [];
      for (const p of preguntas) {
        const r = await aprendizA.post(`/me/attempts/${attemptId}/answers`, { attemptQuestionId: p.attemptQuestionId, answer: { optionId: 'a' } });
        if (!r.ok) mal(`guardar respuesta: ${r.estado} ${JSON.stringify(r.cuerpo).slice(0, 160)}`);
      }
      const entrega = await aprendizA.post(`/me/attempts/${attemptId}/submit`, {});
      comprobar(entrega.ok, `examen entregado: nota ${entrega.cuerpo?.score ?? '?'} · ${entrega.cuerpo?.passed ? 'APROBADO' : 'reprobado'}`, `entregar: ${entrega.estado} ${JSON.stringify(entrega.cuerpo).slice(0, 250)}`);
      comprobar(entrega.cuerpo?.passed === true, 'aprueba con la respuesta correcta', 'no aprobo con la respuesta correcta');
    }
  }
}

paso(11, 'LA CONSTANCIA');
if (tipo.config?.issuesCertificate) {
  const lista = (await aprendizA.get('/me/certificados')).cuerpo;
  const items = lista?.items ?? lista ?? [];
  const suya = items.find?.((c) => c.activityName?.includes(SUFIJO) || c.activity?.id === creado.activityId);
  comprobar(!!suya, 'el tipo emite constancia y la constancia esta', `el tipo emite constancia pero no aparece ninguna (${items.length ?? 0} en total)`);
  if (suya) console.log(`   ... constancia ${suya.code ?? suya.verificationCode ?? ''}`);
} else {
  ok('el tipo no emite constancia: correcto que no haya');
}

paso(12, 'EL CARGO DE AL LADO NO SE CONTAGIA: comprobado desde el aprendiz, no contando filas');
const aprendizB = crearCliente();
let entroB = false;
try { await aprendizB.entrar(docB, claveB); entroB = true; } catch (e) { mal(`el testigo no pudo entrar: ${e.message}`); }
if (entroB) {
  const pendientesB = (await aprendizB.get('/me/pending')).cuerpo;
  const laSuya = (pendientesB?.items ?? pendientesB ?? []).find((p) => p.activity?.id === creado.activityId || p.activityId === creado.activityId);
  comprobar(!laSuya, `a "${cargoB.name}" NO le aparece la induccion de "${cargoA.name}"`, 'le aparece una induccion que no es de su cargo');
}

paso(13, 'ANADIR UN CARGO DESDE LA MATRIZ: nace un requisito nuevo y el primero no se toca');
const encender = await admin.post('/assignment-rules/job-title-matrix', {
  jobTitleId: cargoB.id,
  activityId: creado.activityId,
  enabled: true,
  dueDaysAfterTrigger: -1,
});
comprobar(encender.ok && encender.cuerpo?.enabled === true, `casilla encendida para "${cargoB.name}"`, `encender: ${encender.estado} ${JSON.stringify(encender.cuerpo).slice(0, 200)}`);

const dosRequisitos = (await admin.get(`/activities/${creado.activityId}/requirements`)).cuerpo ?? [];
comprobar(dosRequisitos.length === 2, 'ahora hay DOS requisitos, uno por cargo', `hay ${dosRequisitos.length} requisitos`);
const delA = dosRequisitos.find((r) => r.scope?.jobTitleIds?.[0] === cargoA.id);
const delB = dosRequisitos.find((r) => r.scope?.jobTitleIds?.[0] === cargoB.id);
comprobar(!!delA && !!delB, 'cada requisito conserva SU cargo', 'los requisitos no quedaron uno por cargo');
comprobar(
  delA?.id === req?.id && delA?.assignmentCount === trasElAlta?.assignmentCount,
  'el requisito del primer cargo quedo intacto: mismo id y las mismas obligaciones',
  `el primer requisito cambio: id ${req?.id} -> ${delA?.id}, obligaciones ${trasElAlta?.assignmentCount} -> ${delA?.assignmentCount}`,
);
if (entroB) {
  const pendientesB = (await aprendizB.get('/me/pending')).cuerpo;
  const ahoraSi = (pendientesB?.items ?? pendientesB ?? []).find((p) => p.activity?.id === creado.activityId || p.activityId === creado.activityId);
  comprobar(!!ahoraSi, 'al testigo le nace la obligacion en cuanto su cargo entra en la matriz', 'se encendio la casilla de su cargo y sigue sin aparecerle');
}

/*
  LO QUE YA HIZO NO SE LE VUELVE A PEDIR (2026-09-05).

  Es el caso que la matriz real del cliente va a producir en cuanto exista: en transporte la misma
  induccion vale para auxiliar, montacarguista y coordinador. La deduplicacion del motor es POR
  REGLA, asi que sin esto la regla del cargo nuevo no ve la historia de la persona y le abre la
  ronda 1 de algo que acaba de terminar, con constancia emitida.

  Se prueba con quien SI la completo —el aprendiz A, que aprobo en el paso 10— y no con el
  testigo, que la tiene pendiente: la pregunta es justamente si lo CUMPLIDO cuenta.
*/
paso(14, 'QUIEN YA LA HIZO Y CAMBIA DE CARGO: no la vuelve a deber');
const antesA = (await admin.get(`/assignments?userId=${creado.userA}&targetId=${creado.activityId}&pageSize=50`)).cuerpo;
const cumplidasA = (antesA?.items ?? []).filter((a) => a.status === 'COMPLETED');
console.log(`   ... antes de moverlo tiene ${antesA?.total}: ${(antesA?.items ?? []).map((a) => a.status).join(', ')}`);
comprobar(
  cumplidasA.length === 1,
  'el aprendiz que aprobo tiene su obligacion CUMPLIDA',
  `esperaba 1 cumplida y hay ${cumplidasA.length} — el paso 10 no dejo la obligacion cerrada`,
);

// La casilla de cargoB sigue encendida desde el paso 13, asi que su regla generara para el.
const mueveA = await admin.patch(`/users/${creado.userA}`, { jobTitleId: cargoB.id });
comprobar(mueveA.ok, `pasa de "${cargoA.name}" a "${cargoB.name}", que exige LA MISMA formacion (${mueveA.estado})`, `cambio de cargo: ${mueveA.estado} ${JSON.stringify(mueveA.cuerpo).slice(0, 200)}`);

const trasMoverA = (await admin.get(`/assignments?userId=${creado.userA}&targetId=${creado.activityId}&pageSize=50`)).cuerpo;
const suyasA = trasMoverA?.items ?? [];
console.log(`   ... despues tiene ${trasMoverA?.total}: ${suyasA.map((a) => `#${a.cycleNumber} ${a.status}`).join(' · ')}`);
const vivasA = suyasA.filter((a) => ['PENDING', 'IN_PROGRESS', 'OVERDUE'].includes(a.status));
comprobar(
  vivasA.length === 0,
  'NO le nace nada por el cargo nuevo: ya la hizo y esta induccion no se repite',
  `le nacieron ${vivasA.length} obligacion(es) de una formacion que ya tenia cumplida`,
);
comprobar(
  suyasA.filter((a) => a.status === 'COMPLETED').length === 1,
  'y su evidencia sigue ahi: la cumplida no se toca al cambiar de cargo',
  'se perdio o se duplico la obligacion cumplida',
);

const loQueVeA = (await aprendizA.get('/me/pending')).cuerpo;
const vecesA = (loQueVeA?.items ?? loQueVeA ?? []).filter((p) => p.activity?.id === creado.activityId || p.activityId === creado.activityId).length;
comprobar(vecesA === 0, 'y en su pantalla no le reaparece una formacion que ya termino', `le aparece ${vecesA} vez/veces`);

/*
  EL CASO QUE SOLO TIENE UNA FORMACION POR CARGO.

  Una induccion general no lo sufre: es de todos, y cambiar de puesto no cambia nada. Aqui si —lo
  que se le exige a alguien cambia el dia que lo ascienden— y es el momento en que un sistema de
  cumplimiento se equivoca callado: o le deja pidiendo la formacion del puesto que ya no ocupa, o
  no le pide la del nuevo. Se comprueba que hace las dos cosas, y en el mismo instante.
*/
paso(15, 'CAMBIO DE CARGO CON LA PENDIENTE: lo viejo se retira y lo nuevo nace, sin pasar por el cron');
const antesDelCambio = (await admin.get(`/assignments?userId=${creado.userB}&targetId=${creado.activityId}`)).cuerpo;
console.log(`   ... antes del cambio tiene ${antesDelCambio?.total} obligacion(es): ${(antesDelCambio?.items ?? []).map((a) => a.status).join(', ')}`);

const asciende = await admin.patch(`/users/${creado.userB}`, { jobTitleId: cargoA.id });
comprobar(asciende.ok, `el testigo pasa de "${cargoB.name}" a "${cargoA.name}" (${asciende.estado})`, `cambio de cargo: ${asciende.estado} ${JSON.stringify(asciende.cuerpo).slice(0, 200)}`);

const trasElCambio = (await admin.get(`/assignments?userId=${creado.userB}&targetId=${creado.activityId}`)).cuerpo;
const suyas = trasElCambio?.items ?? [];
console.log(`   ... despues tiene ${trasElCambio?.total}: ${suyas.map((a) => a.status).join(', ')}`);
const retirada = suyas.filter((a) => a.status === 'WITHDRAWN_LEFT_AUDIENCE');
const viva = suyas.filter((a) => ['PENDING', 'IN_PROGRESS', 'OVERDUE'].includes(a.status));
comprobar(retirada.length === 1, 'la obligacion del cargo que dejo queda RETIRADA (no se borra: el auditor la busca)', `esperaba 1 retirada y hay ${retirada.length}`);
comprobar(viva.length === 1, 'y le nace la del cargo nuevo, en el acto', `esperaba 1 obligacion viva y hay ${viva.length}`);

if (entroB) {
  const pendientesB = (await aprendizB.get('/me/pending')).cuerpo;
  const veces = (pendientesB?.items ?? pendientesB ?? []).filter((p) => p.activity?.id === creado.activityId || p.activityId === creado.activityId).length;
  comprobar(veces === 1, 'el aprendiz la ve UNA vez, no dos: lo retirado no le aparece', `le aparece ${veces} veces`);
}
const requisitoATrasCambio = ((await admin.get(`/activities/${creado.activityId}/requirements`)).cuerpo ?? [])
  .find((r) => r.id === req?.id);

paso(16, 'Y APAGARLA tampoco toca al otro cargo');
// Apagar una casilla PIDE NOVEDAD desde el 2026-09-03: es un cambio a la matriz, y de los que
// mas hay que explicar —alguien deja de deber una formacion legal—. Sin motivo, 400.
const sinNovedad = await admin.post('/assignment-rules/job-title-matrix', { jobTitleId: cargoB.id, activityId: creado.activityId, enabled: false });
comprobar(
  sinNovedad.estado === 400 && sinNovedad.cuerpo?.code === 'REASON_REQUIRED',
  'apagar una casilla sin novedad se rechaza en el servidor',
  `esperaba 400 REASON_REQUIRED y vino ${sinNovedad.estado}`,
);

const apagar = await admin.post('/assignment-rules/job-title-matrix', {
  jobTitleId: cargoB.id,
  activityId: creado.activityId,
  enabled: false,
  reason: 'Recorrido automatico: se retira la casilla que abrio la comprobacion.',
});
comprobar(apagar.ok && apagar.cuerpo?.enabled === false, `casilla apagada para "${cargoB.name}"`, `apagar: ${apagar.estado} ${JSON.stringify(apagar.cuerpo).slice(0, 200)}`);
const vuelta = (await admin.get(`/activities/${creado.activityId}/requirements`)).cuerpo ?? [];
comprobar(vuelta.length === 1 && vuelta[0]?.id === req?.id, 'vuelve a quedar solo el requisito del primer cargo, el mismo de antes', `quedaron ${vuelta.length} requisitos`);
comprobar(
  vuelta[0]?.assignmentCount === requisitoATrasCambio?.assignmentCount,
  'y las obligaciones de ese cargo siguen todas ahi',
  `las obligaciones del primer cargo pasaron de ${requisitoATrasCambio?.assignmentCount} a ${vuelta[0]?.assignmentCount}`,
);

await comprobarSeguimiento(admin, creado.activityId, { numeroDePaso: 18 });

paso(17, 'ASISTENCIA: solo aplica a lo presencial');
console.log('   ... la formacion es VIRTUAL: se acredita completando el contenido, no marcando asistencia');
ok('no aplica, y es correcto');

console.log(`\nCREADO PARA LIMPIAR: actividad=${creado.activityId} personas=${creado.userA},${creado.userB} sufijo=${SUFIJO}`);
console.log(`Ojo: exigirla al cargo "${cargoA.name}" creo ${exigir.cuerpo?.created ?? 0} obligacion(es) a gente que ya estaba.`);
process.exit(resumen() === 0 ? 0 : 1);
