// RECORRIDO: EL ACTA DE UNA JORNADA MARCADA A MANO, CON AUSENTES Y JUSTIFICADAS.
//
// ─── QUE HUECO CIERRA ───
//
// `qr-y-firma.mjs` prueba el acta de una jornada marcada con QR y con firma. Faltaba lo mas comun:
// la jornada que marca el instructor de principio a fin, con gente que NO vino y con faltas
// justificadas dentro. Es la que va a generar el noventa por ciento de las actas.
//
// Y es una pregunta que hizo el cliente tal cual: *"¿el acta deberia generarse igual si la asistencia
// la tomo desde inscritos el instructor por interfaz, o solo como esta por QR?"*. La respuesta es que
// si, porque el acta no lee el QR: lee `attendance_records`, donde escriben los tres mecanismos. Esto
// lo comprueba en vez de afirmarlo.
//
// ─── LO QUE COMPRUEBA ───
//
//   1. Se genera con la lista tomada A MANO, sin haber abierto ninguna sesion de QR.
//   2. Cubre a los TRES: quien asistio, quien no, y quien tiene falta justificada.
//   3. La huella es estable: el mismo contenido da la misma huella.
//   4. El PDF se descarga de verdad.
//   5. Y con la lista sin tomar, el acta se rechaza diciendo por que.
//
//   node scripts/recorridos/acta-de-lista.mjs
import { crearCliente, paso, comprobar, resumen, API } from './api.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;
const hoy = new Date().toISOString().slice(0, 10);

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(1, 'MONTAJE: una jornada presencial con tres personas');

const tipos = (await admin.get('/catalogs/activity-types')).cuerpo ?? [];
const tipo = tipos.find(
  (t) => t.active !== false && t.code !== 'MICROLEARNING' && t.config?.participatesInPlan !== true,
);
comprobar(!!tipo, `tipo utilizable: ${tipo?.code}`, 'no hay tipo fuera del plan');
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
  code: `ACTA_${SUFIJO}`, name: `Acta a mano ${SUFIJO}`,
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

const jornada = await admin.post('/offerings', {
  activityVersionId: versionId, kind: 'EVENT', modality: 'PRESENCIAL',
  scheduledDate: hoy, startTime: '08:00', endTime: '12:00', location: `Salon ${SUFIJO}`,
  capacity: 10, intensityTheoryHours: 2, intensityPracticeHours: 2,
});
const offeringId = jornada.cuerpo?.id;
await admin.post(`/offerings/${offeringId}/publish`, { confirm: true });

let n = 0;
async function alta(nombre) {
  n += 1;
  const doc = `AC${marca}${n}`;
  const r = await admin.post('/users', {
    documentNumber: doc, fullName: `${nombre} ${SUFIJO}`,
    email: `${doc.toLowerCase()}@recorrido.test`, jobTitleId: cargo.id, areaId: area.id,
  });
  return { id: r.cuerpo?.id ?? r.cuerpo?.user?.id, doc };
}
const vino = await alta('Asistio');
const noVino = await alta('No asistio');
const justificado = await alta('Falta justificada');

await admin.post(`/offerings/${offeringId}/enroll`, { userIds: [vino.id, noVino.id, justificado.id] });
const filaDe = async (uid) =>
  ((await admin.get(`/offerings/${offeringId}/roster`)).cuerpo?.items ?? []).find((f) => f.user?.id === uid);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(2, 'EL ACTA SIN LISTA TOMADA SE RECHAZA');

const vacia = await admin.post(`/offerings/${offeringId}/acta`);
comprobar(
  !vacia.ok && vacia.cuerpo?.code === 'ATTENDANCE_EMPTY',
  'sin nadie marcado no hay acta, y lo dice: un acta vacia no documenta nada',
  `${vacia.estado} ${JSON.stringify(vacia.cuerpo).slice(0, 160)}`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(3, 'LA LISTA, TOMADA A MANO Y CON LOS TRES ESTADOS');

const marcada = await admin.post(`/offerings/${offeringId}/attendance`, {
  heldOn: hoy,
  items: [
    { enrollmentId: (await filaDe(vino.id))?.id, estado: 'PRESENT' },
    { enrollmentId: (await filaDe(noVino.id))?.id, estado: 'ABSENT' },
    { enrollmentId: (await filaDe(justificado.id))?.id, estado: 'JUSTIFIED', motivo: 'Incapacidad medica del 4 al 8' },
  ],
});
comprobar(marcada.ok, 'se toma la lista con presente, ausente y justificado', `${marcada.estado} ${JSON.stringify(marcada.cuerpo).slice(0, 160)}`);
comprobar(
  marcada.cuerpo?.cerradas === 1 && marcada.cuerpo?.ausentes === 2 && marcada.cuerpo?.justificados === 1,
  `cierra 1, deja 2 ausentes (1 justificada): ${JSON.stringify(marcada.cuerpo)}`,
  JSON.stringify(marcada.cuerpo),
);

const metodos = (await admin.get(`/offerings/${offeringId}/roster`)).cuerpo?.items ?? [];
comprobar(
  metodos.every((f) => f.attendanceMethod === 'INSTRUCTOR'),
  'y las tres constan marcadas por el instructor, no por QR',
  `metodos=${JSON.stringify(metodos.map((f) => f.attendanceMethod))}`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(4, 'EL ACTA, CON LOS TRES DENTRO');

const acta = await admin.post(`/offerings/${offeringId}/acta`);
comprobar(acta.ok, 'el acta se genera sin haber abierto ninguna sesion de QR', `${acta.estado} ${JSON.stringify(acta.cuerpo).slice(0, 200)}`);
comprobar(
  acta.cuerpo?.personas === 3,
  `cubre a las TRES personas, no solo a quien asistio: ${acta.cuerpo?.personas}`,
  `personas=${acta.cuerpo?.personas} — quien no vino tiene que constar: es lo que se demuestra en una auditoria`,
);
comprobar(
  acta.cuerpo?.firmadas === 0,
  'y ninguna firmada, que es lo que corresponde a una lista tomada a mano',
  `firmadas=${acta.cuerpo?.firmadas}`,
);

const descarga = await fetch(`${API.replace('/v1', '')}${acta.cuerpo?.url}`);
const mime = descarga.headers.get('content-type') ?? '';
comprobar(
  descarga.ok && mime.includes('pdf'),
  `el PDF se descarga (${descarga.status}, ${mime})`,
  `${descarga.status} ${mime}`,
);

const otra = await admin.post(`/offerings/${offeringId}/acta`);
comprobar(
  otra.cuerpo?.huella === acta.cuerpo?.huella,
  'la huella no cambia si no cambia la lista, aunque el PDF sea otro archivo',
  `${otra.cuerpo?.huella} != ${acta.cuerpo?.huella}`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(5, 'Y SI SE CORRIGE LA LISTA, LA HUELLA CAMBIA');

await admin.post(`/offerings/${offeringId}/attendance`, {
  heldOn: hoy,
  items: [{ enrollmentId: (await filaDe(noVino.id))?.id, estado: 'PRESENT' }],
});
const tercera = await admin.post(`/offerings/${offeringId}/acta`);
comprobar(
  tercera.cuerpo?.huella !== acta.cuerpo?.huella,
  'otra huella: el acta afirma otra cosa, y eso es exactamente lo que la huella tiene que detectar',
  'la huella no cambio al corregir la lista',
);
const historico = (await admin.get(`/offerings/${offeringId}/actas`)).cuerpo ?? [];
comprobar(
  historico.length === 3,
  `y las tres actas se guardan: ${historico.length}. La de antes de la correccion sigue existiendo`,
  `hay ${historico.length}`,
);

console.log(`\nCREADO PARA LIMPIAR: sufijo=${SUFIJO}`);
process.exit(resumen() === 0 ? 0 : 1);
