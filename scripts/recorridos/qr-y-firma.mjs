// RECORRIDO: LOS MECANISMOS 2 Y 3 DE LA ASISTENCIA — QR DE SESION Y FIRMA (`PENDIENTES` 2.4).
//
// ─── QUE CIERRAN ───
//
// La lista del instructor (mecanismo 1) esta desde el Sprint 6 y sigue siendo la via normal. Faltaban
// los otros dos, diseñados desde el principio y con su sitio en el modelo:
//
//   2. QR DE SESION: se proyecta un codigo que rota; cada quien lo escanea y queda SU sello de
//      tiempo, no una marca que puso alguien despues de memoria.
//   3. FIRMA EN PANTALLA: ademas del escaneo, el trazo. Con el, el sistema genera el ACTA en PDF con
//      la lista, las firmas y una huella del contenido.
//
// Los tres escriben en la MISMA tabla y solo cambian de `method`. Este recorrido comprueba justo eso:
// que la formacion se cierra igual se marque por donde se marque, y que el resto del sistema —la
// obligacion, el seguimiento— no se entera de por que puerta entro.
//
// ─── LO QUE COMPRUEBA ───
//
//   1. El codigo se abre, tiene su QR y sus segundos, y NO se reemplaza al volver a pedirlo mientras
//      siga vigente (recargar la pantalla no puede invalidar lo que la gente esta escaneando).
//   2. Quien lo escanea queda PRESENTE con metodo QR, y su formacion se CIERRA.
//   3. Firmar despues sube el metodo a SIGNATURE y guarda la firma; volver a escanear NO lo baja.
//   4. Las tres compuertas: codigo que no existe, codigo caducado y persona no inscrita.
//   5. El acta: se genera con su huella, se puede descargar, y volver a generarla NO pisa la anterior.
//   6. Y el archivo se puede volver a ABRIR — hasta hoy la evidencia se subia y no habia forma.
//   7. Todo llega igual al Seguimiento que si lo hubiera marcado el instructor.
//
//   node scripts/recorridos/qr-y-firma.mjs
import { crearCliente, paso, ok, comprobar, resumen, API } from './api.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;
const hoy = new Date().toISOString().slice(0, 10);

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(1, 'MONTAJE: una jornada presencial que se cierra por lista');

const tipos = (await admin.get('/catalogs/activity-types')).cuerpo ?? [];
const tipo = tipos.find(
  (t) => t.active !== false && t.code !== 'MICROLEARNING' && t.config?.participatesInPlan !== true,
);
comprobar(!!tipo, `tipo utilizable: ${tipo?.code}`, 'no hay tipo fuera del plan con el que probar');
if (!tipo) { resumen(); process.exit(1); }

const procesos = (await admin.get('/catalogs/processes')).cuerpo ?? [];
const proceso = procesos.find((p) => p.active) ?? procesos[0];
const cargos = ((await admin.get('/catalogs/job-titles')).cuerpo ?? []).filter((c) => c.active);
const areas = ((await admin.get('/catalogs/areas')).cuerpo ?? []).filter((a) => a.active);
const poblacion = new Map();
for (const c of cargos) {
  poblacion.set(c.id, (await admin.post('/audiences/preview', { match: 'ALL', jobTitleIds: [c.id] })).cuerpo?.count ?? 0);
}
const cargo = [...cargos].sort((a, b) => poblacion.get(a.id) - poblacion.get(b.id))[0];
const area = areas[0];

const ficha = await admin.post('/activities', {
  code: `QR_${SUFIJO}`, name: `Con QR y firma ${SUFIJO}`,
  activityTypeId: tipo.id, processId: proceso.id, modality: 'PRESENCIAL',
});
const activityId = ficha.cuerpo?.id;
const versionId = ((await admin.get(`/activities/${activityId}`)).cuerpo?.versions ?? []).find((v) => v.status === 'DRAFT')?.id;
const lec = await admin.post('/lessons', { title: `Contenido ${SUFIJO}`, estimatedMinutes: 5 });
await admin.pedir(`/lessons/${lec.cuerpo.id}/cards`, {
  method: 'PUT',
  body: JSON.stringify({ cards: [{ payload: { cardType: 'TEXT_IMAGE', title: 'Antes', body: 'Revision.' } }] }),
});
await admin.post(`/activities/versions/${versionId}/contents`, {
  type: 'LESSON', title: 'Contenido', isRequired: true, config: { minSeconds: 1 }, lessonId: lec.cuerpo.id,
});
if (tipo.config?.requiresAssessment !== false) {
  const preg = await admin.post('/questions', {
    payload: { qtype: 'SINGLE', stem: 'Antes de operar...', options: [{ id: 'a', text: 'Se revisa' }, { id: 'b', text: 'Se arranca' }], correctOptionId: 'a', points: 1 },
  });
  const ex = await admin.post('/assessments', { title: `Examen ${SUFIJO}` });
  await admin.patch(`/assessments/${ex.cuerpo.id}`, {
    passingScore: 80, maxAttempts: 3, sections: [{ mode: 'FIXED', questionIds: [preg.cuerpo?.id] }],
  });
  await admin.post(`/activities/versions/${versionId}/contents`, {
    type: 'ASSESSMENT', title: 'Examen', isRequired: true, config: {}, assessmentId: ex.cuerpo.id,
  });
}
const publicada = await admin.post(`/activities/versions/${versionId}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
comprobar(publicada.ok, 'formacion publicada', `${publicada.estado} ${JSON.stringify(publicada.cuerpo).slice(0, 200)}`);

await admin.post(`/activities/${activityId}/requirements`, {
  scope: { match: 'ALL', jobTitleIds: [cargo.id] },
  trigger: 'ON_JOIN', dueDaysAfterTrigger: 30, everyMonths: 12, soloNuevos: true,
});

const jornada = await admin.post('/offerings', {
  activityVersionId: versionId, kind: 'EVENT', modality: 'PRESENCIAL',
  scheduledDate: hoy, startTime: '08:00', endTime: '12:00', location: `Salon ${SUFIJO}`,
  capacity: 10, intensityTheoryHours: 2, intensityPracticeHours: 2,
});
const offeringId = jornada.cuerpo?.id;
await admin.post(`/offerings/${offeringId}/publish`, { confirm: true });
comprobar(!!offeringId, 'jornada publicada', 'no se pudo crear la jornada');

// Dos personas con sesion propia: una escanea, la otra firma. Y una tercera que NO se inscribe.
let n = 0;
async function alta(nombre) {
  n += 1;
  const doc = `QR${marca}${n}`;
  const r = await admin.post('/users', {
    documentNumber: doc, fullName: `${nombre} ${SUFIJO}`,
    email: `${doc.toLowerCase()}@recorrido.test`, jobTitleId: cargo.id, areaId: area.id,
  });
  // La clave la devuelve el alta, y se entra con el DOCUMENTO: es como entra la gente de verdad
  // desde el telefono, y es lo que hacen los demas recorridos.
  return {
    id: r.cuerpo?.id ?? r.cuerpo?.user?.id,
    doc,
    clave: r.cuerpo?.generatedPassword ?? r.cuerpo?.password,
  };
}

const escanea = await alta('Escanea el QR');
const firma = await alta('Firma en pantalla');
const deFuera = await alta('No la convocaron');

await admin.post(`/offerings/${offeringId}/enroll`, { userIds: [escanea.id, firma.id] });

async function comoEsaPersona(persona) {
  const cliente = crearCliente();
  await cliente.entrar(persona.doc, persona.clave);
  return cliente;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(2, 'EL CODIGO QUE SE PROYECTA');

const sesion = await admin.post(`/offerings/${offeringId}/sesion`);
comprobar(sesion.ok, 'la sesion se abre', `${sesion.estado} ${JSON.stringify(sesion.cuerpo).slice(0, 200)}`);
const codigo = sesion.cuerpo?.codigo;
comprobar(
  typeof codigo === 'string' && codigo.length === 6,
  `el codigo tiene seis caracteres y se puede dictar: ${codigo}`,
  `codigo=${codigo}`,
);
comprobar(
  !/[01OIL5SB]/.test(codigo ?? ''),
  'sin caracteres que se confundan al leerlo en voz alta',
  `el codigo ${codigo} lleva alguno de 0 O 1 I L 5 S B`,
);
comprobar(
  typeof sesion.cuerpo?.qr === 'string' && sesion.cuerpo.qr.startsWith('data:image/png'),
  'y viene con su QR ya dibujado, para poder proyectarlo',
  `qr=${String(sesion.cuerpo?.qr).slice(0, 40)}`,
);
comprobar(
  sesion.cuerpo?.segundos > 0 && sesion.cuerpo?.segundos <= 90,
  `con ${sesion.cuerpo?.segundos} segundos de vida`,
  `segundos=${sesion.cuerpo?.segundos}`,
);

const otraVez = await admin.post(`/offerings/${offeringId}/sesion`);
comprobar(
  otraVez.cuerpo?.codigo === codigo,
  'pedirlo otra vez NO lo cambia: recargar la pantalla no puede invalidar lo que se esta escaneando',
  `salio ${otraVez.cuerpo?.codigo} en vez de ${codigo}`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(3, 'MECANISMO 2: escaneo y quedo, con mi hora');

const clienteEscanea = await comoEsaPersona(escanea);

const antesDeMarcar = await clienteEscanea.get(`/asistencia/${codigo}`);
comprobar(
  antesDeMarcar.ok && antesDeMarcar.cuerpo?.formacion?.includes(SUFIJO),
  `antes de marcar nada dice a que se apunta: "${antesDeMarcar.cuerpo?.formacion}"`,
  `${antesDeMarcar.estado} ${JSON.stringify(antesDeMarcar.cuerpo).slice(0, 160)}`,
);

const registrada = await clienteEscanea.post(`/asistencia/${codigo}/registrarme`);
comprobar(registrada.ok, 'se registra', `${registrada.estado} ${JSON.stringify(registrada.cuerpo).slice(0, 200)}`);
comprobar(registrada.cuerpo?.metodo === 'QR', `queda con metodo QR`, `metodo=${registrada.cuerpo?.metodo}`);
comprobar(
  registrada.cuerpo?.cerrada === true,
  'y la formacion se CIERRA: por esta puerta se cierra igual que por la lista',
  `cerrada=${registrada.cuerpo?.cerrada}`,
);

const suFila = ((await admin.get(`/offerings/${offeringId}/roster`)).cuerpo?.items ?? []).find((f) => f.user?.id === escanea.id);
comprobar(
  suFila?.attendanceStatus === 'PRESENT' && Boolean(suFila?.completedAt),
  'y en la lista del instructor sale presente y cumplida',
  `estado=${suFila?.attendanceStatus} completada=${suFila?.completedAt}`,
);

const obligacion = ((await admin.get(`/assignments?targetId=${activityId}&userId=${escanea.id}&pageSize=50`)).cuerpo?.items ?? [])
  .find((a) => a.status === 'COMPLETED');
comprobar(
  !!obligacion,
  'la obligacion queda cumplida, igual que si la hubiera marcado el instructor',
  'la obligacion sigue abierta: el QR cerro la inscripcion pero no la obligacion',
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(4, 'MECANISMO 3: la firma');

const clienteFirma = await comoEsaPersona(firma);
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const formulario = new FormData();
formulario.append('file', new Blob([png], { type: 'image/png' }), 'firma.png');
const subida = await clienteFirma.pedir('/media/firma', { method: 'POST', body: formulario });
comprobar(subida.ok, 'la firma se sube por su puerta propia', `${subida.estado} ${JSON.stringify(subida.cuerpo).slice(0, 160)}`);

const firmada = await clienteFirma.post('/asistencia/firmar', { codigo, firmaKey: subida.cuerpo?.key });
comprobar(firmada.ok, 'y se ata a su asistencia de esta jornada', `${firmada.estado} ${JSON.stringify(firmada.cuerpo).slice(0, 200)}`);
comprobar(firmada.cuerpo?.metodo === 'SIGNATURE', 'con metodo SIGNATURE', `metodo=${firmada.cuerpo?.metodo}`);
comprobar(firmada.cuerpo?.cerrada === true || firmada.cuerpo?.ok === true, 'y tambien cierra su formacion', `${JSON.stringify(firmada.cuerpo)}`);

// Volver a escanear NO baja el metodo: la firma ya existe.
const reEscanea = await clienteFirma.post(`/asistencia/${codigo}/registrarme`);
comprobar(
  reEscanea.cuerpo?.metodo === 'SIGNATURE',
  'volver a escanear despues de firmar NO borra la firma ni baja el metodo',
  `metodo=${reEscanea.cuerpo?.metodo}`,
);

const soloPdf = await clienteFirma.pedir('/media/firma', {
  method: 'POST',
  body: (() => {
    const f = new FormData();
    f.append('file', new Blob([Buffer.from('%PDF-1.4 no soy una firma')], { type: 'application/pdf' }), 'x.pdf');
    return f;
  })(),
});
comprobar(
  !soloPdf.ok && soloPdf.cuerpo?.code === 'UNSUPPORTED_FILE_TYPE',
  'y por esa puerta solo entra PNG: la abre cualquiera con sesion',
  `lo acepto: ${soloPdf.estado} ${JSON.stringify(soloPdf.cuerpo).slice(0, 140)}`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(5, 'LAS TRES COMPUERTAS');

const inventado = await clienteEscanea.get('/asistencia/ZZZZZZ');
comprobar(
  !inventado.ok && inventado.cuerpo?.code === 'SESSION_CODE_NOT_FOUND',
  'un codigo que no existe se rechaza diciendo QUE pasa',
  `${inventado.estado} ${JSON.stringify(inventado.cuerpo).slice(0, 140)}`,
);

const clienteDeFuera = await comoEsaPersona(deFuera);
const sinInscribir = await clienteDeFuera.post(`/asistencia/${codigo}/registrarme`);
comprobar(
  !sinInscribir.ok && sinInscribir.cuerpo?.code === 'NOT_ENROLLED',
  'quien no esta convocado no entra a la lista escaneando',
  `lo acepto: ${sinInscribir.estado} ${JSON.stringify(sinInscribir.cuerpo).slice(0, 140)}`,
);

// Caducado: se cierra la sesion a mano, que es lo mismo que le pasa al codigo viejo al rotar.
await admin.post(`/offerings/${offeringId}/sesion/cerrar`);
const trasCerrar = await clienteEscanea.post(`/asistencia/${codigo}/registrarme`);
comprobar(
  !trasCerrar.ok,
  'y con la sesion cerrada el codigo deja de servir: la foto del QR no vale para siempre',
  `lo acepto: ${trasCerrar.estado} ${JSON.stringify(trasCerrar.cuerpo).slice(0, 140)}`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(6, 'EL ACTA, CON SU HUELLA');

const acta = await admin.post(`/offerings/${offeringId}/acta`);
comprobar(acta.ok, 'el acta se genera', `${acta.estado} ${JSON.stringify(acta.cuerpo).slice(0, 200)}`);
comprobar(
  typeof acta.cuerpo?.huella === 'string' && acta.cuerpo.huella.length === 64,
  `con su huella SHA-256: ${String(acta.cuerpo?.huella).slice(0, 16)}...`,
  `huella=${acta.cuerpo?.huella}`,
);
comprobar(
  acta.cuerpo?.personas === 2 && acta.cuerpo?.firmadas === 1,
  `y dice a cuantos cubre: ${acta.cuerpo?.personas} personas, ${acta.cuerpo?.firmadas} con firma`,
  `personas=${acta.cuerpo?.personas} firmadas=${acta.cuerpo?.firmadas}`,
);

// EL PDF SE PUEDE ABRIR: hasta hoy la evidencia se subia y no habia forma de volver a verla.
const descarga = await fetch(`${API.replace('/v1', '')}${acta.cuerpo?.url}`);
const mime = descarga.headers.get('content-type') ?? '';
comprobar(
  descarga.ok && mime.includes('pdf'),
  `el PDF se descarga con su firma de acceso (${descarga.status}, ${mime})`,
  `${descarga.status} ${mime} — una evidencia que no se puede volver a ver no es evidencia`,
);

const segunda = await admin.post(`/offerings/${offeringId}/acta`);
const listaDeActas = (await admin.get(`/offerings/${offeringId}/actas`)).cuerpo ?? [];
comprobar(
  segunda.ok && listaDeActas.length === 2,
  'volver a generarla NO pisa la anterior: el historico se guarda',
  `hay ${listaDeActas.length} acta(s)`,
);
comprobar(
  segunda.cuerpo?.huella === acta.cuerpo?.huella,
  'y con la misma lista la huella es la misma: se firma lo que el acta AFIRMA, no los bytes del PDF',
  `${segunda.cuerpo?.huella} != ${acta.cuerpo?.huella}`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(7, 'Y EL SEGUIMIENTO NO SE ENTERA DE POR QUE PUERTA ENTRO');

const seguimiento = (await admin.get(`/reportes/actividades/${activityId}/ejecucion`)).cuerpo;
const filas = (seguimiento?.items ?? []).filter((f) => [escanea.id, firma.id].includes(f.personaId ?? f.userId));
comprobar(
  filas.length === 2,
  'las dos personas salen en el informe de esta formacion',
  `salen ${filas.length}: ${JSON.stringify(filas.map((f) => f.estado))}`,
);
comprobar(
  filas.every((f) => ['TERMINADA', 'APROBADA', 'CUMPLIDA'].includes(String(f.estado))),
  `y las dos como cumplidas: ${JSON.stringify(filas.map((f) => f.estado))}`,
  `estados=${JSON.stringify(filas.map((f) => f.estado))}`,
);

console.log(`\nCREADO PARA LIMPIAR: sufijo=${SUFIJO}`);
process.exit(resumen() === 0 ? 0 : 1);
