// RECORRIDO: CORREGIR UNA LISTA YA TOMADA, Y LOS BORDES DE LA MARCA DE ASISTENCIA.
//
// ─── POR QUE HACE FALTA OTRO RECORRIDO DE ASISTENCIA ───
//
// `asistencia.mjs` comprueba que tomar la lista FUNCIONA, y `asistencia-matriz.mjs` que funciona en
// los siete tipos. Ninguno de los dos mira lo que pasa DESPUES: el dia siguiente, cuando llega el
// papel que no habia llegado, o cuando alguien se da cuenta de que tecleo mal un numero.
//
// Ese "despues" es justo lo que la pantalla empezo a ofrecer el 2026-09-06 —los ya cumplidos se
// quedan en la lista con su certificado editable— y lo que el cliente pidio asegurar con estas
// palabras: *"que no salgan problemas despues, que se marco y no paso nada"*.
//
// ─── LO QUE COMPRUEBA, Y NINGUN OTRO MIRA ───
//
//   1. Corregir el NUMERO de un papel de alguien ya cumplido: se guarda, y NO se emite una segunda
//      constancia ni se vuelve a cerrar nada.
//   2. Que LLEGUE el papel de quien cerro sin el: se le añade despues, con su vencimiento.
//   3. Que el vencimiento corregido se propague a la OBLIGACION, que es lo que decide cuando vuelve.
//   4. Mandar la MISMA lista dos veces: no duplica nada (el boton de guardar se pulsa dos veces mas
//      a menudo de lo que nadie admite).
//   5. Que marcar AUSENTE a alguien ya cumplido NO lo reabre — el motivo por el que la pantalla no
//      lo ofrece. Si esto cambiara, la pantalla estaria mintiendo y hay que enterarse aqui.
//   6. Una inscripcion de OTRA jornada: se ignora en vez de cerrarle la formacion a quien no estuvo.
//   7. Los bordes que hoy NO tienen compuerta en el servidor: se MIDEN y se reportan, no se dan por
//      buenos. Un recorrido que afirma lo que le gustaria no sirve para nada.
//
//   node scripts/recorridos/asistencia-correcciones.mjs
import { crearCliente, paso, ok, mal, comprobar, resumen } from './api.mjs';

/*
  LA FECHA SE LEE EN HORA DE COLOMBIA. Misma trampa que en los otros recorridos: todo vencimiento se
  guarda al FIN DEL DIA en Bogota, y eso en UTC cae el dia siguiente a las 04:59. Comparar el
  `slice(0, 10)` del ISO contra la fecha que se mando da un dia de diferencia y parece un fallo del
  sistema cuando el fallo esta en la asercion.
*/
const enBogota = (iso) => (iso ? new Date(new Date(iso).getTime() - 5 * 3600000).toISOString().slice(0, 10) : null);

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;
const fecha = new Date().toISOString().slice(0, 10);
/** Un año por delante: lo que diria un papel de la ARL de verdad. */
const dentroDeUnAño = new Date(Date.now() + 330 * 86400000).toISOString().slice(0, 10);
const otroVencimiento = new Date(Date.now() + 200 * 86400000).toISOString().slice(0, 10);

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(1, 'MONTAJE: un tipo que lleva papel de tercero, su formacion, y tres personas');

const tipos = (await admin.get('/catalogs/activity-types')).cuerpo ?? [];
const tipo = tipos.find((t) => t.code === 'RECERTIFICACION');
comprobar(!!tipo?.config?.tracksExternalCertificate, 'el tipo Recertificacion lleva papel de un tercero', 'sin ese tipo no hay nada que corregir');
if (!tipo) { resumen(); process.exit(1); }

const procesos = (await admin.get('/catalogs/processes')).cuerpo ?? [];
const proceso = procesos.find((p) => p.active) ?? procesos[0];
const cargos = ((await admin.get('/catalogs/job-titles')).cuerpo ?? []).filter((c) => c.active);
const areas = ((await admin.get('/catalogs/areas')).cuerpo ?? []).filter((a) => a.active);

/*
  EL CARGO MENOS POBLADO, por lo de siempre: exigir una formacion a un cargo con cien personas
  ensucia la base con cien obligaciones de mentira que despues hay que limpiar a mano.
*/
const poblacion = new Map();
for (const c of cargos) {
  poblacion.set(c.id, (await admin.post('/audiences/preview', { match: 'ALL', jobTitleIds: [c.id] })).cuerpo?.count ?? 0);
}
const cargo = [...cargos].sort((a, b) => poblacion.get(a.id) - poblacion.get(b.id))[0];
const area = areas[0];

const ficha = await admin.post('/activities', {
  code: `CORR_${SUFIJO}`,
  name: `Recertificacion de alturas ${SUFIJO}`,
  description: 'La dicta la ARL; el papel puede llegar dias despues de la jornada.',
  activityTypeId: tipo.id, processId: proceso.id, modality: 'PRESENCIAL',
});
comprobar(ficha.ok, 'ficha creada', `ficha: ${ficha.estado} ${JSON.stringify(ficha.cuerpo).slice(0, 200)}`);
const activityId = ficha.cuerpo?.id;
if (!activityId) { resumen(); process.exit(1); }
const versionId = ((await admin.get(`/activities/${activityId}`)).cuerpo?.versions ?? []).find((v) => v.status === 'DRAFT')?.id;

const leccion = await admin.post('/lessons', { title: `Contenido ${SUFIJO}`, estimatedMinutes: 10 });
await admin.pedir(`/lessons/${leccion.cuerpo.id}/cards`, {
  method: 'PUT',
  body: JSON.stringify({ cards: [{ payload: { cardType: 'TEXT_IMAGE', title: 'Antes de subir', body: 'Revision del arnes.' } }] }),
});
await admin.post(`/activities/versions/${versionId}/contents`, {
  type: 'LESSON', title: 'Contenido', isRequired: true, config: { minSeconds: 1 }, lessonId: leccion.cuerpo.id,
});
/*
  EL TIPO EXIGE EVALUACION y nadie la va a responder: la jornada la dicta la ARL en el salon. Sin el
  examen montado, la compuerta de la Decision #74 ni deja publicar la version.
*/
const pregunta = await admin.post('/questions', {
  payload: {
    qtype: 'SINGLE', stem: 'Antes de trabajar en alturas...',
    options: [{ id: 'a', text: 'Se revisa el arnes' }, { id: 'b', text: 'Se sube y ya' }],
    correctOptionId: 'a', points: 1,
  },
});
const examen = await admin.post('/assessments', { title: `Examen ${SUFIJO}` });
await admin.patch(`/assessments/${examen.cuerpo.id}`, {
  passingScore: 80, maxAttempts: 3, sections: [{ mode: 'FIXED', questionIds: [pregunta.cuerpo?.id] }],
});
await admin.post(`/activities/versions/${versionId}/contents`, {
  type: 'ASSESSMENT', title: 'Examen', isRequired: true, config: {}, assessmentId: examen.cuerpo.id,
});
const publicada = await admin.post(`/activities/versions/${versionId}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
comprobar(publicada.ok, 'version publicada', `publicar: ${publicada.estado} ${JSON.stringify(publicada.cuerpo).slice(0, 200)}`);

const requisito = await admin.post(`/activities/${activityId}/requirements`, {
  scope: { match: 'ALL', jobTitleIds: [cargo.id] },
  trigger: 'ON_JOIN', dueDaysAfterTrigger: 30, everyMonths: 12, soloNuevos: true,
});
comprobar(requisito.ok, `exigida al cargo "${cargo.name}"`, `requisito: ${requisito.estado}`);

const alta = async (n, nombre) => {
  const doc = `CR${marca}${n}`;
  const r = await admin.post('/users', {
    documentNumber: doc, fullName: `${nombre} ${SUFIJO}`,
    email: `${doc.toLowerCase()}@recorrido.test`, jobTitleId: cargo.id, areaId: area.id,
  });
  return { ok: r.ok, id: r.cuerpo?.id ?? r.cuerpo?.user?.id, doc, clave: r.cuerpo?.generatedPassword ?? r.cuerpo?.password };
};
const conPapel = await alta(1, 'Vino con papel');
const sinPapel = await alta(2, 'Vino sin papel');
const noVino = await alta(3, 'No asistio');
comprobar(conPapel.ok && sinPapel.ok && noVino.ok, 'tres personas con ese cargo y su obligacion', 'no se pudieron crear las tres');

const suyas = async (uid) => ((await admin.get(`/assignments?targetId=${activityId}&userId=${uid}&pageSize=50`)).cuerpo?.items ?? []);
const constanciasDe = async (persona) => {
  const cliente = crearCliente();
  try { await cliente.entrar(persona.doc, persona.clave); } catch { return null; }
  const r = (await cliente.get('/me/certificados')).cuerpo;
  const items = r?.items ?? r ?? [];
  return Array.isArray(items) ? items.filter((c) => (c.activityName ?? '').includes(SUFIJO)) : [];
};

const jornada = await admin.post('/offerings', {
  activityVersionId: versionId, kind: 'EVENT', modality: 'PRESENCIAL',
  scheduledDate: fecha, startTime: '08:00', endTime: '12:00', location: `Torre ${SUFIJO}`,
  executedBy: 'ARL', executedByOther: 'ARL Sura', capacity: 10,
  intensityTheoryHours: 2, intensityPracticeHours: 2,
});
comprobar(jornada.ok, 'jornada publicada y dictada por ARL Sura', `jornada: ${jornada.estado}`);
const offeringId = jornada.cuerpo?.id;
await admin.post(`/offerings/${offeringId}/publish`, { confirm: true });
await admin.post(`/offerings/${offeringId}/enroll`, { userIds: [conPapel.id, sinPapel.id, noVino.id] });
const lista = () => admin.get(`/offerings/${offeringId}/roster`).then((r) => r.cuerpo?.items ?? []);
const filaDe = async (uid) => (await lista()).find((f) => f.user?.id === uid);

const inscritos = await lista();
comprobar(inscritos.length === 3, 'los tres convocados', `hay ${inscritos.length}`);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(2, 'SE TOMA LA LISTA: uno con papel, uno sin papel todavia, y uno que no vino');

const primera = await admin.post(`/offerings/${offeringId}/attendance`, {
  heldOn: fecha,
  items: [
    { enrollmentId: (await filaDe(conPapel.id))?.id, estado: 'PRESENT', certificate: { number: `MAL-${marca}`, validUntil: dentroDeUnAño } },
    { enrollmentId: (await filaDe(sinPapel.id))?.id, estado: 'PRESENT' },
    { enrollmentId: (await filaDe(noVino.id))?.id, estado: 'ABSENT' },
  ],
});
comprobar(
  primera.ok && primera.cuerpo?.cerradas === 2 && primera.cuerpo?.ausentes === 1,
  'cierra a los dos que asistieron y deja debiendo al que no vino',
  `${primera.estado} ${JSON.stringify(primera.cuerpo)}`,
);

const constanciasAntes = await constanciasDe(conPapel);
comprobar(
  constanciasAntes !== null && constanciasAntes.length === 1,
  `se emite UNA constancia propia (${constanciasAntes?.length})`,
  `constancias tras cerrar: ${constanciasAntes === null ? 'no se pudo entrar' : constanciasAntes.length}`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(3, 'SE CORRIGE UN NUMERO MAL TECLEADO, sobre alguien YA CUMPLIDO');
/*
  Es la correccion del dia a dia y la razon por la que la pantalla deja los cumplidos en la lista.
  El servidor ve la inscripcion cerrada y solo escribe los campos del certificado.
*/
const antesDeCorregir = await filaDe(conPapel.id);
const correccion = await admin.post(`/offerings/${offeringId}/attendance`, {
  heldOn: fecha,
  items: [{ enrollmentId: antesDeCorregir?.id, estado: 'PRESENT', certificate: { number: `BIEN-${marca}`, validUntil: dentroDeUnAño } }],
});
comprobar(correccion.ok, 'la correccion se acepta', `${correccion.estado} ${JSON.stringify(correccion.cuerpo).slice(0, 200)}`);

const trasCorregir = await filaDe(conPapel.id);
comprobar(
  trasCorregir?.extCertNumber === `BIEN-${marca}`,
  `el numero queda corregido: ${trasCorregir?.extCertNumber}`,
  `sigue diciendo ${trasCorregir?.extCertNumber} y deberia ser BIEN-${marca}`,
);
comprobar(
  trasCorregir?.completedAt === antesDeCorregir?.completedAt,
  'y la fecha de cumplimiento NO se mueve: corregir un papel no vuelve a cerrar la formacion',
  `completedAt paso de ${antesDeCorregir?.completedAt} a ${trasCorregir?.completedAt}`,
);
comprobar(
  correccion.cuerpo?.cerradas === 0,
  'el servidor no cuenta la correccion como un cierre nuevo',
  `dice cerradas=${correccion.cuerpo?.cerradas}, y no habia nada que cerrar`,
);

const constanciasTras = await constanciasDe(conPapel);
comprobar(
  constanciasTras !== null && constanciasTras.length === 1,
  'y NO se emite una segunda constancia: sigue habiendo una sola',
  `ahora tiene ${constanciasTras?.length} constancias de la misma formacion — una correccion no es un cumplimiento nuevo`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(4, 'LLEGA EL PAPEL DE QUIEN CERRO SIN EL, quince dias despues');
/*
  El caso que el cliente puso con estas palabras: "si todavia no ha llegado, dejalo en blanco y
  añadelo despues". Sin esto, la unica salida seria no cerrar la formacion de alguien que SI asistio.
*/
const sinPapelAntes = await filaDe(sinPapel.id);
comprobar(
  !sinPapelAntes?.extCertNumber && sinPapelAntes?.completedAt,
  'cerro sin papel: cumplida y sin certificado',
  `numero=${sinPapelAntes?.extCertNumber} completada=${sinPapelAntes?.completedAt}`,
);

const llegoElPapel = await admin.post(`/offerings/${offeringId}/attendance`, {
  heldOn: fecha,
  items: [{ enrollmentId: sinPapelAntes?.id, estado: 'PRESENT', certificate: { number: `TARDE-${marca}`, validUntil: otroVencimiento } }],
});
const sinPapelTras = await filaDe(sinPapel.id);
comprobar(
  llegoElPapel.ok && sinPapelTras?.extCertNumber === `TARDE-${marca}`,
  `el papel se añade despues: ${sinPapelTras?.extCertNumber}`,
  `${llegoElPapel.estado} numero=${sinPapelTras?.extCertNumber}`,
);
comprobar(
  sinPapelTras?.extCertIssuer === 'ARL Sura',
  'y el emisor lo sigue poniendo la jornada, tambien al añadirlo tarde',
  `emisor=${sinPapelTras?.extCertIssuer}`,
);
const constanciasSinPapel = await constanciasDe(sinPapel);
comprobar(
  constanciasSinPapel !== null && constanciasSinPapel.length === 1,
  'sigue con UNA sola constancia propia',
  `tiene ${constanciasSinPapel?.length}`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(5, 'EL VENCIMIENTO CORREGIDO LLEGA A LA OBLIGACION, que es lo que decide cuando vuelve');
/*
  De nada sirve guardar bien el papel si la obligacion se quedo con la fecha vieja: el informe de
  Vencimientos y el motor leen la obligacion, no el certificado.
*/
const obligacion = (await suyas(sinPapel.id)).find((a) => a.status === 'COMPLETED' || a.validUntilOverride);
comprobar(
  enBogota(obligacion?.validUntilOverride) === otroVencimiento,
  `la obligacion recoge el vencimiento del papel (${otroVencimiento})`,
  `validUntilOverride=${enBogota(obligacion?.validUntilOverride)} y el papel dice ${otroVencimiento}`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(6, 'LA MISMA LISTA DOS VECES: el boton de guardar se pulsa dos veces mas de lo que nadie admite');

const antesDeRepetir = await lista();
const repetida = await admin.post(`/offerings/${offeringId}/attendance`, {
  heldOn: fecha,
  items: antesDeRepetir.map((f) => ({
    enrollmentId: f.id,
    estado: f.attendanceStatus ?? 'PRESENT',
    ...(f.attendanceStatus === 'JUSTIFIED' ? { motivo: f.attendanceNote ?? 'repetido' } : {}),
  })),
});
const trasRepetir = await lista();
comprobar(repetida.ok, 'mandar la lista entera otra vez no falla', `${repetida.estado} ${JSON.stringify(repetida.cuerpo).slice(0, 200)}`);
comprobar(
  trasRepetir.length === antesDeRepetir.length,
  'no se duplica ninguna fila del roster',
  `pasa de ${antesDeRepetir.length} a ${trasRepetir.length}`,
);
comprobar(
  antesDeRepetir.every((f) => {
    const ahora = trasRepetir.find((x) => x.id === f.id);
    return ahora?.completedAt === f.completedAt && ahora?.extCertNumber === f.extCertNumber;
  }),
  'y nada cambia: mismas fechas de cumplimiento y mismos certificados',
  'algo cambio al volver a mandar exactamente lo mismo',
);
const constanciasRepetir = await constanciasDe(conPapel);
comprobar(
  constanciasRepetir !== null && constanciasRepetir.length === 1,
  'ni se emite una constancia de mas',
  `tras repetir tiene ${constanciasRepetir?.length} constancias`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(7, 'MARCAR AUSENTE A ALGUIEN YA CUMPLIDO: la razon por la que la pantalla no lo ofrece');
/*
  Esto NO es una funcion: es el borde que obliga a que la pantalla enseñe el estado de los cumplidos
  como TEXTO. El servidor escribe la marca de asistencia y deja la formacion cerrada, asi que el
  acta diria una cosa y el expediente la contraria. Si algun dia esto cambiara —si empezara a
  reabrir— la pantalla estaria escondiendo algo que si pasa, y hay que enterarse aqui y no en una
  auditoria.
*/
const cumplidaAntes = await filaDe(conPapel.id);
const intentoAusente = await admin.post(`/offerings/${offeringId}/attendance`, {
  heldOn: fecha,
  items: [{ enrollmentId: cumplidaAntes?.id, estado: 'ABSENT' }],
});
const cumplidaTras = await filaDe(conPapel.id);
comprobar(
  intentoAusente.ok && cumplidaTras?.completedAt !== null,
  'la formacion sigue CUMPLIDA: marcar ausente despues no la reabre',
  `completedAt=${cumplidaTras?.completedAt} tras marcarla ausente`,
);
comprobar(
  cumplidaTras?.attendanceStatus === 'ABSENT',
  'pero la marca de asistencia SI cambia, y por eso quedan diciendo cosas distintas',
  `attendanceStatus=${cumplidaTras?.attendanceStatus}`,
);
ok('POR ESO la pantalla no deja cambiar la asistencia de un cumplido: deshacerlo de verdad es ANULAR, que no existe aun');

// Se deja como estaba, para no dejar la base con una contradiccion sembrada por una prueba.
await admin.post(`/offerings/${offeringId}/attendance`, {
  heldOn: fecha,
  items: [{ enrollmentId: cumplidaAntes?.id, estado: 'PRESENT', certificate: { number: `BIEN-${marca}`, validUntil: dentroDeUnAño } }],
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(8, 'UNA INSCRIPCION DE OTRA JORNADA: se ignora, no se le cierra la formacion a quien no estuvo');

const otraJornada = await admin.post('/offerings', {
  activityVersionId: versionId, kind: 'EVENT', modality: 'PRESENCIAL',
  scheduledDate: fecha, startTime: '14:00', endTime: '16:00', location: `Torre B ${SUFIJO}`,
  executedBy: 'ARL', executedByOther: 'ARL Sura', capacity: 10,
  intensityTheoryHours: 1, intensityPracticeHours: 1,
});
await admin.post(`/offerings/${otraJornada.cuerpo?.id}/publish`, { confirm: true });
const ajeno = await alta(4, 'De otra jornada');
await admin.post(`/offerings/${otraJornada.cuerpo?.id}/enroll`, { userIds: [ajeno.id] });
const listaAjena = (await admin.get(`/offerings/${otraJornada.cuerpo?.id}/roster`)).cuerpo?.items ?? [];

const intruso = await admin.post(`/offerings/${offeringId}/attendance`, {
  heldOn: fecha,
  items: [{ enrollmentId: listaAjena[0]?.id, estado: 'PRESENT' }],
});
comprobar(
  intruso.ok && (intruso.cuerpo?.ignoradas ?? []).length === 1 && intruso.cuerpo?.cerradas === 0,
  'la inscripcion de otra jornada se IGNORA y no cierra nada',
  `${intruso.estado} ${JSON.stringify(intruso.cuerpo)}`,
);
const ajenoTras = ((await admin.get(`/offerings/${otraJornada.cuerpo?.id}/roster`)).cuerpo?.items ?? [])[0];
comprobar(
  !ajenoTras?.completedAt,
  'y quien no estuvo en esa jornada sigue debiendo la suya',
  `se le cerro la formacion desde una lista donde no estaba: completedAt=${ajenoTras?.completedAt}`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(9, 'LOS BORDES QUE HOY NO TIENEN COMPUERTA: se MIDEN, no se dan por buenos');
/*
  Un recorrido que afirma lo que le gustaria no sirve de nada. Estos dos casos se mandan a proposito
  y se ANOTA lo que hace el servidor hoy. Si acepta, no es un fallo del recorrido: es un pendiente
  que queda escrito con su medida, y la pantalla mientras tanto lo evita por su lado.
*/
const cuartaFila = await filaDe(noVino.id);

// (a) Una justificacion sin motivo. La pantalla exige cinco caracteres; el servidor, ¿que hace?
const sinMotivo = await admin.post(`/offerings/${offeringId}/attendance`, {
  heldOn: fecha,
  items: [{ enrollmentId: cuartaFila?.id, estado: 'JUSTIFIED' }],
});
console.log(`   ... JUSTIFIED sin motivo -> ${sinMotivo.estado} ${JSON.stringify(sinMotivo.cuerpo).slice(0, 160)}`);
if (sinMotivo.ok) {
  const traza = await filaDe(noVino.id);
  console.log(`   ... quedo guardada como ${traza?.attendanceStatus} con motivo ${JSON.stringify(traza?.attendanceNote)}`);
  mal('el servidor ACEPTA una falta justificada sin motivo: hoy solo lo impide la pantalla (pendiente)');
} else {
  ok('el servidor rechaza una falta justificada sin motivo, igual que la pantalla');
}

// (b) Un certificado que vence ANTES de la jornada que lo origina.
const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const venceAntes = await admin.post(`/offerings/${offeringId}/attendance`, {
  heldOn: fecha,
  items: [{ enrollmentId: cuartaFila?.id, estado: 'PRESENT', certificate: { number: `CADUCO-${marca}`, validUntil: ayer } }],
});
console.log(`   ... certificado que vence ayer -> ${venceAntes.estado} ${JSON.stringify(venceAntes.cuerpo).slice(0, 160)}`);
comprobar(
  !venceAntes.ok && venceAntes.cuerpo?.code === 'CERT_EXPIRES_BEFORE_SESSION',
  `el servidor rechaza un certificado que vence antes de la jornada (${ayer} < ${fecha})`,
  `lo ACEPTA: ${venceAntes.estado} ${JSON.stringify(venceAntes.cuerpo).slice(0, 160)} — un papel ya caducado no acredita nada`,
);
// Y el lote entero se rechaza: no puede quedar media lista marcada.
const traslote = await filaDe(noVino.id);
comprobar(
  !traslote?.completedAt,
  'y no cierra a nadie del lote: la lista se acepta entera o no se acepta',
  `quedo cumplida pese al rechazo: completedAt=${traslote?.completedAt}`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(10, 'Y LA LISTA SIGUE CONTANDO LA VERDAD despues de todas las correcciones');

const final = await lista();
const resumenFinal = final.map((f) => `${f.user?.fullName?.split(' ')[0]}=${f.attendanceStatus ?? 'sin marcar'}${f.completedAt ? '/cumplida' : ''}${f.extCertNumber ? `/${f.extCertNumber}` : ''}`);
console.log(`   ... ${resumenFinal.join(' · ')}`);
comprobar(
  final.filter((f) => f.completedAt).length >= 2,
  'los que asistieron siguen cumplidos',
  `solo ${final.filter((f) => f.completedAt).length} cumplidas al final`,
);
comprobar(
  final.every((f) => !f.extCertNumber || f.extCertIssuer === 'ARL Sura'),
  'y todo certificado guardado lleva el emisor de la jornada',
  'hay un certificado sin emisor o con otro emisor',
);

console.log(`\nCREADO PARA LIMPIAR: sufijo=${SUFIJO} · 4 personas · 1 formacion · 2 jornadas`);
process.exit(resumen() === 0 ? 0 : 1);
