// RECORRIDO: QUE SE EXIGE × SI SE TOMA LISTA, DE PUNTA A PUNTA.
//
// ─── LO QUE LO ORIGINA (`PENDIENTES` 2.7) ───
//
// Hasta el 2026-09-21 «como se acredita» era UN booleano que respondia dos preguntas a la vez, y por
// eso no se podia pedir lo que el cliente describio:
//
//   *"si la formacion tiene evaluacion se cierra por contenido, pero se quiere el QR, la firma o el
//   acta como constancia de que estuvo presente"*
//
// Al elegir «al completar el contenido» desaparecia la lista entera. Ahora son dos preguntas —que se
// exige, y si se toma lista— y ademas aparece «las dos cosas», que es lo que pide un auditor en una
// presencial con examen y no se podia pedir.
//
// ─── POR QUE ESTE RECORRIDO EXISTE, ADEMAS DE LAS 459 UNITARIAS ───
//
// `cierre-de-la-jornada.spec.ts` prueba la REGLA: 108 combinaciones de forma × modalidad × exigencia
// × lista, en funciones puras. Eso fija lo que la regla responde, y no prueba **que el resto del
// sistema le haga caso**. Este recorrido hace el camino completo contra la base real —crear la
// formacion, publicarla, convocar, inscribir, marcar, cursar, aprobar, reprobar y mirar la
// constancia— porque el fallo que importa aqui es el de "esto no llega hasta alli":
//
//   · que marcar la lista cierre algo que no debia cerrar,
//   · que aprobar el examen cierre una jornada que ademas exigia venir,
//   · que se emita una constancia por una formacion a medio cumplir.
//
// Los tres emiten papeles que el cliente le enseña a un auditor.
//
// ─── LOS CUATRO ESCENARIOS, Y LO QUE SE COMPRUEBA EN CADA UNO ───
//
//   F1  ATTENDANCE            la lista cierra; el examen no obliga          (lo de siempre)
//   F2  CONTENT sin lista     no hay lista: marcarla se RECHAZA             (lo de siempre)
//   F3  CONTENT con lista     hay lista y NO cierra: es evidencia           (lo nuevo del 2.7)
//   F4  BOTH                  ni venir basta, ni aprobar desde casa         (lo nuevo del 2.7)
//
// Y los bordes que solo aparecen combinando: los DOS ORDENES de `BOTH` (asistir→aprobar y
// aprobar→asistir, que son caminos de codigo distintos), asistir y REPROBAR, el papel de un tercero
// en una lista que no acredita, y que el QR se comporte igual que la lista del instructor.
//
//   node scripts/recorridos/exigencia-y-lista.mjs
import { crearCliente, paso, ok, mal, comprobar, resumen } from './api.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;
const fecha = new Date().toISOString().slice(0, 10);

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(1, 'MONTAJE: cuatro formaciones, una por exigencia, todas con leccion y examen');

const tipos = (await admin.get('/catalogs/activity-types')).cuerpo ?? [];
const tipo = tipos.find((t) => t.code === 'RECERTIFICACION');
comprobar(!!tipo, 'existe el tipo Recertificacion (lleva papel de tercero y emite constancia)', 'falta ese tipo');
if (!tipo) { resumen(); process.exit(1); }
comprobar(tipo.config?.issuesCertificate === true, 'y su configuracion promete constancia', 'no emite constancia: el escenario de la constancia no mediria nada');

const procesos = (await admin.get('/catalogs/processes')).cuerpo ?? [];
const proceso = procesos.find((p) => p.active) ?? procesos[0];
const cargos = ((await admin.get('/catalogs/job-titles')).cuerpo ?? []).filter((c) => c.active);
const areas = ((await admin.get('/catalogs/areas')).cuerpo ?? []).filter((a) => a.active);

// El cargo menos poblado, por lo de siempre: no sembrar obligaciones de mentira en media empresa.
const poblacion = new Map();
for (const c of cargos) {
  poblacion.set(c.id, (await admin.post('/audiences/preview', { match: 'ALL', jobTitleIds: [c.id] })).cuerpo?.count ?? 0);
}
const cargo = [...cargos].sort((a, b) => poblacion.get(a.id) - poblacion.get(b.id))[0];
const area = areas[0];

async function montarFormacion(codigo, nombre) {
  const ficha = await admin.post('/activities', {
    code: `${codigo}_${SUFIJO}`, name: `${nombre} ${SUFIJO}`,
    description: 'Matriz de exigencia y lista de asistencia.',
    activityTypeId: tipo.id, processId: proceso.id, modality: 'PRESENCIAL',
  });
  const activityId = ficha.cuerpo?.id;
  const versionId = ((await admin.get(`/activities/${activityId}`)).cuerpo?.versions ?? []).find((v) => v.status === 'DRAFT')?.id;

  const leccion = await admin.post('/lessons', { title: `Contenido ${nombre} ${SUFIJO}`, estimatedMinutes: 5 });
  await admin.pedir(`/lessons/${leccion.cuerpo.id}/cards`, {
    method: 'PUT',
    body: JSON.stringify({ cards: [{ payload: { cardType: 'TEXT_IMAGE', title: 'Antes de empezar', body: 'Revision del puesto.' } }] }),
  });
  await admin.post(`/activities/versions/${versionId}/contents`, {
    type: 'LESSON', title: 'Contenido', isRequired: true, config: { minSeconds: 1 }, lessonId: leccion.cuerpo.id,
  });

  const pregunta = await admin.post('/questions', {
    payload: {
      qtype: 'SINGLE', stem: 'Antes de operar...',
      options: [{ id: 'a', text: 'Se revisa el equipo' }, { id: 'b', text: 'Se arranca y ya' }],
      correctOptionId: 'a', points: 1,
    },
  });
  const examen = await admin.post('/assessments', { title: `Examen ${nombre} ${SUFIJO}` });
  await admin.patch(`/assessments/${examen.cuerpo.id}`, {
    passingScore: 80, maxAttempts: 3, sections: [{ mode: 'FIXED', questionIds: [pregunta.cuerpo?.id] }],
  });
  await admin.post(`/activities/versions/${versionId}/contents`, {
    type: 'ASSESSMENT', title: 'Examen', isRequired: true, config: {}, assessmentId: examen.cuerpo.id,
  });
  await admin.post(`/activities/versions/${versionId}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
  await admin.post(`/activities/${activityId}/requirements`, {
    scope: { match: 'ALL', jobTitleIds: [cargo.id] },
    trigger: 'ON_JOIN', dueDaysAfterTrigger: 30, everyMonths: 12, soloNuevos: true,
  });
  return { activityId, versionId, nombre };
}

/** Una jornada de esa formacion con la exigencia y la lista que se pidan. */
async function montarJornada(formacion, extra) {
  const r = await admin.post('/offerings', {
    activityVersionId: formacion.versionId, kind: 'EVENT',
    scheduledDate: fecha, startTime: '08:00', endTime: '12:00', location: `Salon ${SUFIJO}`,
    executedBy: 'ARL', executedByOther: 'ARL Sura', capacity: 40,
    intensityTheoryHours: 2, intensityPracticeHours: 2,
    ...extra,
  });
  const id = r.cuerpo?.id;
  if (!id) { mal(`no se pudo crear la jornada de ${formacion.nombre}: ${r.estado} ${JSON.stringify(r.cuerpo)}`); return null; }
  await admin.post(`/offerings/${id}/publish`, { confirm: true });
  return id;
}

const F1 = await montarFormacion('EXL1', 'Exige lista');
const F2 = await montarFormacion('EXL2', 'Exige contenido');
const F3 = await montarFormacion('EXL3', 'Contenido con lista');
const F4 = await montarFormacion('EXL4', 'Exige las dos');
comprobar(
  [F1, F2, F3, F4].every((f) => f.activityId && f.versionId),
  'las cuatro formaciones quedan publicadas y exigidas al cargo',
  'alguna no se pudo montar',
);
if (![F1, F2, F3, F4].every((f) => f.activityId)) { resumen(); process.exit(1); }

const J1 = await montarJornada(F1, { modality: 'PRESENCIAL', completionRequirement: 'ATTENDANCE' });
const J2 = await montarJornada(F2, { modality: 'VIRTUAL', completionRequirement: 'CONTENT' });
const J3 = await montarJornada(F3, { modality: 'PRESENCIAL', completionRequirement: 'CONTENT', takesAttendance: true });
const J4 = await montarJornada(F4, { modality: 'PRESENCIAL', completionRequirement: 'BOTH' });
if (![J1, J2, J3, J4].every(Boolean)) { resumen(); process.exit(1); }

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(2, 'EL SERVIDOR DICE LAS DOS COSAS, y son independientes');

/*
  Se lee del SERVIDOR y no se da por hecho: la pantalla decide con estos dos campos si enseña la
  pestaña de la lista y que dice de ella. Si el servidor los calculara mal, el resto del recorrido
  seguiria pasando —marcar funcionaria igual— y la pantalla mentiria sin que nada lo delatara.
*/
const esperado = [
  [J1, 'ATTENDANCE', true, 'exige lista y la toma'],
  [J2, 'CONTENT', false, 'exige contenido y NO toma lista'],
  [J3, 'CONTENT', true, 'exige contenido y SI toma lista (lo nuevo del 2.7)'],
  [J4, 'BOTH', true, 'exige las dos, y por tanto toma lista'],
];
for (const [id, exigencia, lista, etiqueta] of esperado) {
  const d = (await admin.get(`/offerings/${id}`)).cuerpo;
  comprobar(
    d?.exigencia === exigencia && d?.admiteAsistencia === lista,
    `${etiqueta}: exigencia=${d?.exigencia} admiteAsistencia=${d?.admiteAsistencia}`,
    `${etiqueta}: esperaba ${exigencia}/${lista} y llego ${d?.exigencia}/${d?.admiteAsistencia}`,
  );
}

let contador = 0;
async function alta(nombre) {
  contador += 1;
  const doc = `EX${marca}${contador}`;
  const r = await admin.post('/users', {
    documentNumber: doc, fullName: `${nombre} ${SUFIJO}`,
    email: `${doc.toLowerCase()}@recorrido.test`, jobTitleId: cargo.id, areaId: area.id,
  });
  return { id: r.cuerpo?.id ?? r.cuerpo?.user?.id, doc, clave: r.cuerpo?.generatedPassword ?? r.cuerpo?.password };
}

const rosterDe = (offeringId) => admin.get(`/offerings/${offeringId}/roster`).then((r) => r.cuerpo?.items ?? []);
const filaDe = async (offeringId, uid) => (await rosterDe(offeringId)).find((f) => f.user?.id === uid);
const marcar = (offeringId, items) => admin.post(`/offerings/${offeringId}/attendance`, { heldOn: fecha, items });

/** Inscribe a alguien nuevo en una jornada y devuelve su fila. */
async function inscribir(offeringId, etiqueta) {
  const persona = await alta(etiqueta);
  await admin.post(`/offerings/${offeringId}/enroll`, { userIds: [persona.id] });
  const fila = await filaDe(offeringId, persona.id);
  return { persona, enrollmentId: fila?.id };
}

/** Hace el temario entero. `acierta = false` responde mal a proposito, para reprobar. */
async function cursar({ persona, enrollmentId }, acierta = true) {
  const aprendiz = crearCliente();
  await aprendiz.entrar(persona.doc, persona.clave);
  const curso = (await aprendiz.get(`/me/enrollments/${enrollmentId}`)).cuerpo;
  const piezas = curso?.contents ?? curso?.version?.contents ?? [];
  const leccion = piezas.find((c) => c.type === 'LESSON');
  if (leccion) await aprendiz.post(`/me/contents/${leccion.id}/progress`, { pct: 100, secondsSpent: 60, source: 'DECLARED' });
  const examenPieza = piezas.find((c) => c.type === 'ASSESSMENT');
  const examenId = examenPieza?.assessmentId ?? examenPieza?.assessment?.id;
  const intento = await aprendiz.post(`/me/enrollments/${enrollmentId}/attempts?assessmentId=${examenId}`, {});
  const attemptId = intento.cuerpo?.id ?? intento.cuerpo?.attempt?.id;
  const preguntas = intento.cuerpo?.questions ?? (await aprendiz.get(`/me/attempts/${attemptId}`)).cuerpo?.questions ?? [];
  for (const p of preguntas) {
    await aprendiz.post(`/me/attempts/${attemptId}/answers`, {
      attemptQuestionId: p.attemptQuestionId,
      answer: { optionId: acierta ? 'a' : 'b' },
    });
  }
  await aprendiz.post(`/me/attempts/${attemptId}/submit`, {});
}

/** ¿Quedo CUMPLIDA la obligacion de esa formacion para esa persona? */
const cumplida = async (activityId, uid) =>
  ((await admin.get(`/assignments?targetId=${activityId}&userId=${uid}&pageSize=50`)).cuerpo?.items ?? [])
    .some((a) => a.status === 'COMPLETED');

/** Cuantas constancias tiene de las formaciones de este recorrido. */
const constanciasDe = async (persona) => {
  const cliente = crearCliente();
  try { await cliente.entrar(persona.doc, persona.clave); } catch { return null; }
  const r = (await cliente.get('/me/certificados')).cuerpo;
  const items = r?.items ?? r ?? [];
  return Array.isArray(items) ? items.filter((c) => (c.activityName ?? '').includes(SUFIJO)).length : null;
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(3, 'F1 · ATTENDANCE: la lista cierra, y el examen no obliga (lo que ya hacia)');

const a1 = await inscribir(J1, 'Asiste y ya');
const r1 = await marcar(J1, [{ enrollmentId: a1.enrollmentId, estado: 'PRESENT' }]);
comprobar(r1.ok, 'se puede marcar la lista', `marcar devolvio ${r1.estado}`);
comprobar(await cumplida(F1.activityId, a1.persona.id), 'marcar PRESENT CIERRA la formacion', 'no se cerro');
comprobar((await constanciasDe(a1.persona)) >= 1, 'y emite su constancia', 'no hay constancia');

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(4, 'F2 · CONTENT sin lista: marcarla se RECHAZA, y el contenido cierra');

const a2 = await inscribir(J2, 'Solo contenido');
const r2 = await marcar(J2, [{ enrollmentId: a2.enrollmentId, estado: 'PRESENT' }]);
comprobar(
  r2.estado === 409 && r2.cuerpo?.code === 'OFFERING_NOT_ATTENDABLE',
  'marcar la lista se rechaza con OFFERING_NOT_ATTENDABLE',
  `esperaba 409 OFFERING_NOT_ATTENDABLE y llego ${r2.estado} ${r2.cuerpo?.code}`,
);
comprobar(!(await cumplida(F2.activityId, a2.persona.id)), 'y no ha cerrado nada', 'se cerro sin hacer nada');

/*
  LAS DOS OTRAS PUERTAS DE LA MISMA LISTA TAMBIEN SE CIERRAN. El QR y la firma escriben en
  `attendance_records` igual que el instructor (#158): si una de las tres admitiera lo que las otras
  rechazan, el mismo hecho tendria tres respuestas segun por donde se entre.
*/
const qr2 = await admin.post(`/offerings/${J2}/sesion`, {});
comprobar(
  qr2.estado === 409 && qr2.cuerpo?.code === 'OFFERING_NOT_ATTENDABLE',
  'y el QR de sesion se rechaza igual que la lista',
  `el QR devolvio ${qr2.estado} ${qr2.cuerpo?.code} en una jornada sin lista`,
);

/*
  Y EL CIERRE SOLO POR CONTENIDO, ENTERO: no basta con que cierre. Se comprueba que hace TODO lo que
  esta formacion promete —cumplir la obligacion y emitir su constancia— porque una jornada sin lista
  es el camino mas comun del producto y es justo el que nadie vuelve a mirar.
*/
comprobar((await constanciasDe(a2.persona)) === 0, 'antes de cursar no tiene constancia', 'ya tenia constancia sin hacer nada');
await cursar(a2);
comprobar(await cumplida(F2.activityId, a2.persona.id), 'hacer el temario y aprobar SI la cierra', 'no se cerro al aprobar');
comprobar((await constanciasDe(a2.persona)) === 1, 'y emite UNA constancia', 'no hay exactamente una constancia');
comprobar(
  !(await filaDe(J2, a2.persona.id).then((f) => f?.attendance?.status)),
  'sin ninguna marca de asistencia: nadie estuvo en ningun salon',
  'quedo una marca de asistencia en una jornada que no toma lista',
);

/*
  Y CURSAR DE NUEVO NO DUPLICA NADA. Volver a entrar a una formacion ya cumplida es lo que hace
  cualquiera que quiera repasar, y una segunda constancia por el mismo esfuerzo es un papel falso.
*/
await cursar(a2);
comprobar((await constanciasDe(a2.persona)) === 1, 'y volver a entrar y aprobar no emite una segunda', 'se duplico la constancia al repetir');

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(5, 'F3 · CONTENT con lista: la marca se guarda y NO cierra — es evidencia (EL CASO DEL 2.7)');

const a3 = await inscribir(J3, 'Estuvo y curso');
const r3 = await marcar(J3, [{ enrollmentId: a3.enrollmentId, estado: 'PRESENT' }]);
comprobar(r3.ok, 'la lista SI se puede tomar, aunque no sea lo que acredita', `marcar devolvio ${r3.estado} ${JSON.stringify(r3.cuerpo)}`);

const fila3 = await filaDe(J3, a3.persona.id);
comprobar(
  fila3?.attendance?.status === 'PRESENT' || fila3?.asistencia?.status === 'PRESENT' || fila3?.attendanceStatus === 'PRESENT',
  'y queda registrada en el acta de la jornada',
  `la fila no dice que asistio: ${JSON.stringify(fila3?.attendance ?? fila3?.asistencia ?? fila3?.attendanceStatus)}`,
);
comprobar(
  !(await cumplida(F3.activityId, a3.persona.id)),
  'pero NO cierra la formacion: la constancia la da el contenido',
  'la marca cerro la formacion, que es justo lo que este cambio impide',
);
comprobar((await constanciasDe(a3.persona)) === 0, 'y no hay constancia todavia', 'se emitio una constancia sin cumplir');

await cursar(a3);
comprobar(await cumplida(F3.activityId, a3.persona.id), 'al aprobar el examen, ahora si cierra', 'no cerro al aprobar');
comprobar((await constanciasDe(a3.persona)) === 1, 'y emite UNA sola constancia', 'el numero de constancias no es 1');

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(6, 'F3 · el papel de un tercero SE GUARDA desde la lista, y aun asi no cierra nada');

/*
  ESTO ESTUVO AL REVES UNAS HORAS, y la correccion es la leccion.

  La primera version RECHAZABA el certificado en una lista que no acredita (`CERT_NOT_ON_THIS_LIST`)
  y mandaba a registrarlo desde la ficha de la persona. Razonamiento: el papel dice «cumplio», y esta
  lista no da nada por cumplido.

  Estaba mal, y lo senalo el cliente al preguntar donde deberia registrarse: **el papel es EVIDENCIA,
  no una acreditacion**. Quien decide si la formacion queda cumplida es la exigencia de la jornada,
  siempre — nunca el papel. El instructor lo tiene en la mano al terminar la sesion, asi que este es
  el sitio donde se recoge de verdad; mandarlo a teclearlo persona por persona en Usuarios no
  protegia nada, solo garantizaba que la evidencia se perdiera.
*/
const a3b = await inscribir(J3, 'Con papel');
const vence = new Date(Date.now() + 200 * 86400000).toISOString().slice(0, 10);
const r3b = await marcar(J3, [{
  enrollmentId: a3b.enrollmentId, estado: 'PRESENT',
  certificate: { number: `CERT-${marca}`, issuer: 'ARL Sura', validUntil: vence },
}]);
comprobar(r3b.ok, 'la lista acepta el certificado', `marcar devolvio ${r3b.estado} ${JSON.stringify(r3b.cuerpo).slice(0, 200)}`);

const fila3b = await filaDe(J3, a3b.persona.id);
comprobar(
  (fila3b?.extCertNumber ?? fila3b?.certificate?.number ?? '') === `CERT-${marca}`,
  'y queda guardado en su inscripcion',
  `el numero guardado es ${JSON.stringify(fila3b?.extCertNumber ?? fila3b?.certificate?.number)}`,
);
comprobar(
  !(await cumplida(F3.activityId, a3b.persona.id)),
  'pero NO da por cumplida la formacion: eso lo decide la exigencia, no el papel',
  'el papel cerro la formacion en una jornada que se acredita por contenido',
);
comprobar((await constanciasDe(a3b.persona)) === 0, 'y no se emite constancia', 'se emitio constancia sin cumplir');

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(7, 'F4 · BOTH, orden 1: primero asiste, despues aprueba');

const a4 = await inscribir(J4, 'Asiste y aprueba');
const r4 = await marcar(J4, [{ enrollmentId: a4.enrollmentId, estado: 'PRESENT' }]);
comprobar(r4.ok, 'la lista se toma', `marcar devolvio ${r4.estado}`);
comprobar(
  !(await cumplida(F4.activityId, a4.persona.id)),
  'venir NO basta: sigue sin cumplir',
  'cerro solo con asistir, y esta jornada exige las dos cosas',
);
await cursar(a4);
comprobar(await cumplida(F4.activityId, a4.persona.id), 'y al aprobar, cierra', 'no cerro teniendo las dos');
comprobar((await constanciasDe(a4.persona)) === 1, 'con su constancia', 'no hay exactamente una constancia');

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(8, 'F4 · BOTH, orden 2: primero aprueba, despues asiste (otro camino de codigo)');

/*
  NO ES EL MISMO CASO AL REVES. Cerrar al aprobar lo decide `CompletionService.evaluate`; cerrar al
  marcar lo decide la puerta de la lista. Son dos sitios distintos y cada uno podia olvidarse de la
  mitad que no es suya — que es exactamente la clase de hueco que un recorrido encuentra y una
  unitaria no.
*/
const a5 = await inscribir(J4, 'Aprueba y asiste');
await cursar(a5);
comprobar(
  !(await cumplida(F4.activityId, a5.persona.id)),
  'aprobar desde casa NO basta: sigue sin cumplir',
  'cerro solo con aprobar, y esta jornada exige haber venido',
);
comprobar((await constanciasDe(a5.persona)) === 0, 'y sin constancia', 'se emitio constancia sin haber asistido');

const r5 = await marcar(J4, [{ enrollmentId: a5.enrollmentId, estado: 'PRESENT' }]);
comprobar(r5.ok, 'se marca su asistencia', `marcar devolvio ${r5.estado}`);
comprobar(await cumplida(F4.activityId, a5.persona.id), 'y ahora si cierra, al completarse la otra mitad', 'no cerro al marcar teniendo el examen aprobado');
comprobar((await constanciasDe(a5.persona)) === 1, 'con su constancia', 'no hay exactamente una constancia');

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(9, 'F4 · BOTH: asiste pero REPRUEBA — queda pendiente, y sin papel');

/*
  Es la decision que se tomo al abrir esto: con «las dos cosas», quien viene pero no aprueba **no
  cumple**. La asistencia queda registrada como evidencia de que estuvo; la formacion sigue viva y
  puede repetir el examen. Lo contrario —cerrar igual y guardar la nota— seria «las dos cosas» de
  nombre y «la lista» de verdad.
*/
const a6 = await inscribir(J4, 'Asiste y reprueba');
await marcar(J4, [{ enrollmentId: a6.enrollmentId, estado: 'PRESENT' }]);
await cursar(a6, false);
comprobar(!(await cumplida(F4.activityId, a6.persona.id)), 'reprobando no cumple, aunque haya venido', 'cerro con el examen reprobado');
comprobar((await constanciasDe(a6.persona)) === 0, 'y no se emite ninguna constancia', 'se emitio constancia con el examen reprobado');

const fila6 = await filaDe(J4, a6.persona.id);
comprobar(
  fila6?.attendance?.status === 'PRESENT' || fila6?.asistencia?.status === 'PRESENT' || fila6?.attendanceStatus === 'PRESENT',
  'pero su asistencia SI queda registrada: estuvo, y eso es cierto',
  'se perdio la evidencia de que asistio',
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(10, 'F4 · BOTH: quien no viene lo sigue debiendo, y la pantalla dice QUE le falta');

const a7 = await inscribir(J4, 'No vino');
await cursar(a7);
const aprendiz7 = crearCliente();
await aprendiz7.entrar(a7.persona.doc, a7.persona.clave);
const curso7 = (await aprendiz7.get(`/me/enrollments/${a7.enrollmentId}`)).cuerpo;

/*
  ESTE PASO ENCONTRO UN FALLO DE VERDAD, y por eso se queda escrito asi.

  El reproductor devolvia los contenidos y nada mas. Con el temario entero terminado y sin asistir,
  la pantalla enseñaba **«Formacion terminada»** en verde a alguien que NO habia cumplido: decia lo
  contrario que el expediente, y la persona se enteraba al ver su formacion en rojo semanas despues.

  El motor siempre lo supo (`missing` incluye «Asistencia a la sesion»); lo que faltaba era que el
  dato llegara a la pantalla. Es el fallo tipico de "esto no llega hasta alli", que una unitaria no
  puede ver porque las dos mitades, por separado, estaban bien.
*/
comprobar(
  curso7?.exigencia === 'BOTH',
  'el reproductor dice que la jornada exige las dos cosas',
  `exigencia=${curso7?.exigencia}`,
);
comprobar(
  curso7?.faltaAsistencia === true,
  'y dice que lo que falta es la ASISTENCIA, en vez de darla por terminada',
  `faltaAsistencia=${curso7?.faltaAsistencia} (con el temario completo y sin asistir)`,
);
comprobar(
  curso7?.asistenciaRegistrada === false,
  'con la asistencia marcada como no registrada',
  `asistenciaRegistrada=${curso7?.asistenciaRegistrada}`,
);

/*
  Y AL REVES: quien SI asistio y aprobo no puede ver ese aviso. Un aviso que sale siempre es ruido,
  y ademas delataria que se calcula sin mirar la asistencia.
*/
const aprendiz4 = crearCliente();
await aprendiz4.entrar(a4.persona.doc, a4.persona.clave);
const curso4 = (await aprendiz4.get(`/me/enrollments/${a4.enrollmentId}`)).cuerpo;
comprobar(
  curso4?.faltaAsistencia === false && curso4?.asistenciaRegistrada === true,
  'y a quien si vino no se le dice que le falta',
  `faltaAsistencia=${curso4?.faltaAsistencia} asistenciaRegistrada=${curso4?.asistenciaRegistrada}`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(11, 'Y EL SEGUIMIENTO dice lo mismo que paso');

/*
  El motor puede estar bien y el informe mintiendo: ya paso una vez (ver el LEEME). Se comprueba que
  las cuatro personas que cumplieron salen cumplidas y las dos que no, no.
*/
const deberianCumplir = [[F1, a1], [F2, a2], [F3, a3], [F4, a4], [F4, a5]];
const noDeberian = [[F4, a6], [F4, a7]];
let cuadra = true;
for (const [f, p] of deberianCumplir) if (!(await cumplida(f.activityId, p.persona.id))) { cuadra = false; mal(`${p.persona.doc} deberia estar cumplida y no lo esta`); }
for (const [f, p] of noDeberian) if (await cumplida(f.activityId, p.persona.id)) { cuadra = false; mal(`${p.persona.doc} NO deberia estar cumplida y lo esta`); }
if (cuadra) ok('las cinco cumplidas y las dos pendientes cuadran con lo que se hizo');

console.log(`\nCreado con sufijo ${SUFIJO}: 4 formaciones, 4 jornadas, ${contador} personas.`);
process.exit(resumen() === 0 ? 0 : 1);
