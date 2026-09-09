// RECORRIDO: SUBIR EL PAPEL. El certificado de un tercero y el acta firmada de la jornada.
//
// ─── QUE CIERRA ───
//
// El punto 2.1 de `PENDIENTES`: las columnas existian (`ext_cert_file_key`,
// `offerings.attendance_sheet_key`), la API las aceptaba, y no habia por donde mandarlas. La
// evidencia se quedaba a medio camino: constaba QUE paso y quien lo marco, pero no el papel.
//
// ─── LO QUE COMPRUEBA, Y NINGUN OTRO MIRA ───
//
//   1. La puerta de subida existe y es la SUYA: `POST /media/evidencia` con `attendance:take`, no
//      la de contenido, que pide `lessons:manage` y crearia un paquete del catalogo.
//   2. Solo acepta lo que es evidencia: PDF e imagenes. Un video o una hoja de calculo se rechazan.
//   3. Y lo comprueba por los BYTES: un archivo renombrado a `.pdf` no cuela.
//   4. La clave del certificado llega a la INSCRIPCION de esa persona.
//   5. La clave del acta llega a la JORNADA, y es UNA por jornada.
//   6. Se puede cerrar SIN papel: el escaneo es opcional y no bloquea la formacion.
//   7. Y el papel se puede añadir DESPUES sobre alguien ya cumplido, como su numero.
//
//   node scripts/recorridos/asistencia-evidencia.mjs
import { crearCliente, API, paso, ok, mal, comprobar, resumen } from './api.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;
const fecha = new Date().toISOString().slice(0, 10);
const vence = new Date(Date.now() + 330 * 86400000).toISOString().slice(0, 10);

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

/*
  UN PDF DE VERDAD, hecho a mano. No basta con llamar `.pdf` a un archivo: el servidor mira los
  BYTES (`detectType`), que es justo lo que hay que poder demostrar aqui. Un PDF minimo valido
  empieza por `%PDF-` y eso es lo que se comprueba.
*/
const pdf = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
  'latin1',
);
/** Un PNG minimo: la firma de ocho bytes basta para que se reconozca la familia. */
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(64).fill(0)]);

/** Sube un archivo a la puerta de evidencia y devuelve la respuesta cruda. */
async function subir(cliente, nombre, contenido, tipo) {
  const form = new FormData();
  form.append('file', new Blob([contenido], { type: tipo }), nombre);
  const r = await cliente.pedir('/media/evidencia', { method: 'POST', body: form });
  return r;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(1, 'LA PUERTA DE SUBIDA: acepta el papel, y solo el papel');

const subidaPdf = await subir(admin, `certificado-${marca}.pdf`, pdf, 'application/pdf');
comprobar(
  subidaPdf.ok && typeof subidaPdf.cuerpo?.key === 'string',
  `un PDF se sube y devuelve su clave (${String(subidaPdf.cuerpo?.key).slice(-40)})`,
  `${subidaPdf.estado} ${JSON.stringify(subidaPdf.cuerpo).slice(0, 200)}`,
);
comprobar(
  subidaPdf.cuerpo?.mimeType === 'application/pdf',
  'y la reconoce como PDF',
  `mimeType=${subidaPdf.cuerpo?.mimeType}`,
);

const subidaPng = await subir(admin, `acta-${marca}.png`, png, 'image/png');
comprobar(
  subidaPng.ok && subidaPng.cuerpo?.mimeType === 'image/png',
  'una imagen tambien: el acta se fotografia con el telefono mas de lo que parece',
  `${subidaPng.estado} ${JSON.stringify(subidaPng.cuerpo).slice(0, 160)}`,
);

/*
  LO QUE NO ES EVIDENCIA SE RECHAZA, y se comprueba por los bytes. Se manda un texto plano con
  nombre de PDF y tipo declarado de PDF: si el servidor se fiara de cualquiera de los dos, colaria.
*/
const disfrazado = await subir(admin, `trampa-${marca}.pdf`, Buffer.from('esto no es un pdf'), 'application/pdf');
comprobar(
  !disfrazado.ok && disfrazado.cuerpo?.code === 'UNSUPPORTED_FILE_TYPE',
  'un archivo renombrado a .pdf NO cuela: se mira el contenido, no el nombre ni lo que diga el navegador',
  `lo acepto: ${disfrazado.estado} ${JSON.stringify(disfrazado.cuerpo).slice(0, 160)}`,
);

const sinArchivo = await admin.pedir('/media/evidencia', { method: 'POST', body: new FormData() });
comprobar(!sinArchivo.ok, 'y sin archivo devuelve error, no una clave vacia', `${sinArchivo.estado}`);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(2, 'MONTAJE: una formacion con papel de tercero y su jornada');

const tipos = (await admin.get('/catalogs/activity-types')).cuerpo ?? [];
const tipo = tipos.find((t) => t.code === 'RECERTIFICACION');
if (!tipo) { mal('falta el tipo RECERTIFICACION'); resumen(); process.exit(1); }

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
  code: `EVID_${SUFIJO}`, name: `Recertificacion con papel ${SUFIJO}`,
  description: 'Para probar que el escaneo llega a su sitio.',
  activityTypeId: tipo.id, processId: proceso.id, modality: 'PRESENCIAL',
});
const activityId = ficha.cuerpo?.id;
const versionId = ((await admin.get(`/activities/${activityId}`)).cuerpo?.versions ?? []).find((v) => v.status === 'DRAFT')?.id;
const leccion = await admin.post('/lessons', { title: `Contenido ${SUFIJO}`, estimatedMinutes: 5 });
await admin.pedir(`/lessons/${leccion.cuerpo.id}/cards`, {
  method: 'PUT',
  body: JSON.stringify({ cards: [{ payload: { cardType: 'TEXT_IMAGE', title: 'Antes', body: 'Revision.' } }] }),
});
await admin.post(`/activities/versions/${versionId}/contents`, {
  type: 'LESSON', title: 'Contenido', isRequired: true, config: { minSeconds: 1 }, lessonId: leccion.cuerpo.id,
});
const pregunta = await admin.post('/questions', {
  payload: {
    qtype: 'SINGLE', stem: 'Antes de operar...',
    options: [{ id: 'a', text: 'Se revisa' }, { id: 'b', text: 'Se arranca' }],
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
await admin.post(`/activities/versions/${versionId}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
await admin.post(`/activities/${activityId}/requirements`, {
  scope: { match: 'ALL', jobTitleIds: [cargo.id] },
  trigger: 'ON_JOIN', dueDaysAfterTrigger: 30, everyMonths: 12, soloNuevos: true,
});

const jornada = await admin.post('/offerings', {
  activityVersionId: versionId, kind: 'EVENT', modality: 'PRESENCIAL',
  scheduledDate: fecha, startTime: '08:00', endTime: '12:00', location: `Salon ${SUFIJO}`,
  executedBy: 'ARL', executedByOther: 'ARL Sura', capacity: 10,
  intensityTheoryHours: 2, intensityPracticeHours: 2,
});
const offeringId = jornada.cuerpo?.id;
await admin.post(`/offerings/${offeringId}/publish`, { confirm: true });
comprobar(!!offeringId, 'formacion y jornada listas', `jornada: ${jornada.estado}`);

let n = 0;
async function alta(nombre) {
  n += 1;
  const doc = `EV${marca}${n}`;
  const r = await admin.post('/users', {
    documentNumber: doc, fullName: `${nombre} ${SUFIJO}`,
    email: `${doc.toLowerCase()}@recorrido.test`, jobTitleId: cargo.id, areaId: area.id,
  });
  return { id: r.cuerpo?.id ?? r.cuerpo?.user?.id, doc };
}
const conPapel = await alta('Con papel');
const sinPapel = await alta('Sin papel');
const tardio = await alta('Papel tardio');
await admin.post(`/offerings/${offeringId}/enroll`, { userIds: [conPapel.id, sinPapel.id, tardio.id] });
const lista = () => admin.get(`/offerings/${offeringId}/roster`).then((r) => r.cuerpo?.items ?? []);
const filaDe = async (uid) => (await lista()).find((f) => f.user?.id === uid);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(3, 'EL PAPEL DE CADA PERSONA Y EL ACTA DE LA JORNADA, en el mismo envio');

const claveCert = subidaPdf.cuerpo.key;
const claveActa = subidaPng.cuerpo.key;

const marcado = await admin.post(`/offerings/${offeringId}/attendance`, {
  heldOn: fecha,
  attendanceSheetKey: claveActa,
  items: [
    {
      enrollmentId: (await filaDe(conPapel.id))?.id,
      estado: 'PRESENT',
      certificate: { number: `CERT-${marca}`, validUntil: vence, fileKey: claveCert },
    },
    // Sin papel a proposito: el escaneo es OPCIONAL y no puede bloquear el cierre.
    { enrollmentId: (await filaDe(sinPapel.id))?.id, estado: 'PRESENT' },
    { enrollmentId: (await filaDe(tardio.id))?.id, estado: 'PRESENT', certificate: { number: `TARDE-${marca}` } },
  ],
});
comprobar(marcado.ok && marcado.cuerpo?.cerradas === 3, 'los tres cierran', `${marcado.estado} ${JSON.stringify(marcado.cuerpo)}`);
comprobar(marcado.cuerpo?.acta === true, 'y el servidor confirma que quedo el acta', `acta=${marcado.cuerpo?.acta}`);

const filaConPapel = await filaDe(conPapel.id);
comprobar(
  filaConPapel?.extCertFileKey === claveCert,
  'la clave del certificado llega a la INSCRIPCION de esa persona',
  `extCertFileKey=${filaConPapel?.extCertFileKey}`,
);

const detalle = (await admin.get(`/offerings/${offeringId}`)).cuerpo;
comprobar(
  detalle?.attendanceSheetKey === claveActa,
  'y la del acta a la JORNADA, no a nadie en particular',
  `attendanceSheetKey=${detalle?.attendanceSheetKey}`,
);

const filaSinPapel = await filaDe(sinPapel.id);
comprobar(
  Boolean(filaSinPapel?.completedAt) && !filaSinPapel?.extCertFileKey,
  'quien no trajo papel queda CUMPLIDA igual: el escaneo no bloquea la formacion',
  `cumplida=${Boolean(filaSinPapel?.completedAt)} clave=${filaSinPapel?.extCertFileKey}`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(4, 'Y EL PAPEL QUE LLEGA DESPUES, sobre alguien ya cumplido');

const otroPdf = await subir(admin, `tardio-${marca}.pdf`, pdf, 'application/pdf');
const filaTardio = await filaDe(tardio.id);
const correccion = await admin.post(`/offerings/${offeringId}/attendance`, {
  heldOn: fecha,
  items: [
    {
      enrollmentId: filaTardio?.id,
      estado: 'PRESENT',
      certificate: { number: `TARDE-${marca}`, validUntil: vence, fileKey: otroPdf.cuerpo.key },
    },
  ],
});
const trasCorregir = await filaDe(tardio.id);
comprobar(
  correccion.ok && trasCorregir?.extCertFileKey === otroPdf.cuerpo.key,
  'el escaneo se añade despues, igual que el numero',
  `${correccion.estado} clave=${trasCorregir?.extCertFileKey}`,
);
comprobar(
  trasCorregir?.completedAt === filaTardio?.completedAt,
  'y sin mover su fecha de cumplimiento: adjuntar un papel no vuelve a cerrar nada',
  `paso de ${filaTardio?.completedAt} a ${trasCorregir?.completedAt}`,
);

console.log(`\nCREADO PARA LIMPIAR: sufijo=${SUFIJO}`);
process.exit(resumen() === 0 ? 0 : 1);
