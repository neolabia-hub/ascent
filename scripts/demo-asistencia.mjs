// DEMO: deja jornadas PUBLICADAS y con gente convocada para poder pulsar "Tomar asistencia".
//
// No es una prueba: no comprueba nada y no limpia nada. Existe para poder MIRAR la pantalla, que es
// lo que pidio el cliente —*"no veo una que pueda probar el boton, deja una publicada para ver los
// cambios"*— y para que las tres formas de la lista se vean una al lado de la otra:
//
//   1. PROPIA          la dicta la empresa. La lista solo pregunta quien vino.
//   2. DE UN TERCERO   la dicta la ARL y la formacion lleva certificado: pide numero y vencimiento,
//                      y la ENTIDAD sale sola de la jornada.
//   3. QUE CERTIFICA   emite constancia propia al cerrar por asistencia (no lleva papel externo).
//
// Se borra con el mismo procedimiento que el resto de lo de prueba (ver el RUNBOOK): por prefijo.
//
//   node scripts/demo-asistencia.mjs
import { crearCliente, paso, ok, mal } from './recorridos/api.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `DEMO${marca}`;
const fecha = new Date().toISOString().slice(0, 10);

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

const tipos = (await admin.get('/catalogs/activity-types')).cuerpo ?? [];
const procesos = (await admin.get('/catalogs/processes')).cuerpo ?? [];
const proceso = procesos.find((p) => p.active) ?? procesos[0];
const cargos = ((await admin.get('/catalogs/job-titles')).cuerpo ?? []).filter((c) => c.active);
const areas = ((await admin.get('/catalogs/areas')).cuerpo ?? []).filter((a) => a.active);

// El cargo menos poblado, por lo de siempre: no ensuciar la base con obligaciones de mentira.
const poblacion = new Map();
for (const c of cargos) {
  poblacion.set(c.id, (await admin.post('/audiences/preview', { match: 'ALL', jobTitleIds: [c.id] })).cuerpo?.count ?? 0);
}
const cargo = [...cargos].sort((a, b) => poblacion.get(a.id) - poblacion.get(b.id))[0];
const area = areas[0];

let contador = 0;
async function alta(nombre) {
  contador += 1;
  const doc = `DM${marca}${contador}`;
  const r = await admin.post('/users', {
    documentNumber: doc,
    fullName: `${nombre} ${SUFIJO}`,
    email: `${doc.toLowerCase()}@demo.test`,
    jobTitleId: cargo.id,
    areaId: area.id,
  });
  return r.cuerpo?.id ?? r.cuerpo?.user?.id ?? null;
}

/** Ficha + leccion + (examen si el tipo lo pide) + publicar. */
async function montar({ tipo, nombre, indice, papelDeTercero }) {
  const ficha = await admin.post('/activities', {
    code: `DEMO${indice}_${SUFIJO}`,
    name: `${nombre} ${SUFIJO}`,
    description: 'Ejemplo para ver la lista de asistencia.',
    activityTypeId: tipo.id,
    processId: proceso.id,
    modality: 'PRESENCIAL',
    ...(papelDeTercero === null ? {} : { tracksExternalCertificate: papelDeTercero }),
  });
  if (!ficha.ok) { mal(`${nombre}: ficha ${ficha.estado} ${JSON.stringify(ficha.cuerpo).slice(0, 180)}`); return null; }
  const activityId = ficha.cuerpo.id;
  const versionId = ((await admin.get(`/activities/${activityId}`)).cuerpo?.versions ?? []).find((v) => v.status === 'DRAFT')?.id;

  const leccion = await admin.post('/lessons', { title: `Leccion ${nombre} ${SUFIJO}`, estimatedMinutes: 10 });
  await admin.pedir(`/lessons/${leccion.cuerpo.id}/cards`, { method: 'PUT', body: JSON.stringify({
    cards: [{ payload: { cardType: 'TEXT_IMAGE', title: 'Antes de empezar', body: 'Revision del puesto de trabajo.' } }],
  }) });
  await admin.post(`/activities/versions/${versionId}/contents`, {
    type: 'LESSON', title: 'Contenido', isRequired: true, config: { minSeconds: 1 }, lessonId: leccion.cuerpo.id,
  });

  if (tipo.config?.requiresAssessment === true) {
    const q = await admin.post('/questions', { payload: {
      qtype: 'SINGLE',
      stem: '¿Que se hace antes de empezar la tarea?',
      options: [{ id: 'a', text: 'Se inspecciona el puesto' }, { id: 'b', text: 'Se empieza sin mas' }],
      correctOptionId: 'a', points: 1,
    } });
    const ex = await admin.post('/assessments', { title: `Examen ${nombre} ${SUFIJO}` });
    await admin.patch(`/assessments/${ex.cuerpo.id}`, {
      passingScore: 80, maxAttempts: 3, sections: [{ mode: 'FIXED', questionIds: [q.cuerpo?.id] }],
    });
    await admin.post(`/activities/versions/${versionId}/contents`, {
      type: 'ASSESSMENT', title: 'Examen', isRequired: true, config: {}, assessmentId: ex.cuerpo.id,
    });
  }

  const pub = await admin.post(`/activities/versions/${versionId}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
  if (!pub.ok) { mal(`${nombre}: publicar ${pub.estado} ${JSON.stringify(pub.cuerpo).slice(0, 200)}`); return null; }
  return { activityId, versionId };
}

/** Jornada publicada con tres personas dentro, lista para tomar asistencia. */
async function jornadaConGente({ versionId, nombre, quienLaDicta, hora }) {
  const j = await admin.post('/offerings', {
    activityVersionId: versionId, kind: 'EVENT', modality: 'PRESENCIAL',
    scheduledDate: fecha, startTime: hora, endTime: '17:00',
    location: `Sala de formacion ${SUFIJO}`,
    ...(quienLaDicta ? { executedBy: 'ARL', executedByOther: quienLaDicta } : { executedBy: 'PROPIOS' }),
    capacity: 20, intensityTheoryHours: 2, intensityPracticeHours: 2,
  });
  if (!j.ok) { mal(`${nombre}: jornada ${j.estado} ${JSON.stringify(j.cuerpo).slice(0, 200)}`); return null; }
  const pub = await admin.post(`/offerings/${j.cuerpo.id}/publish`, { confirm: true });
  if (!pub.ok) { mal(`${nombre}: publicar jornada ${pub.estado} ${JSON.stringify(pub.cuerpo).slice(0, 200)}`); return null; }

  const gente = [];
  for (const quien of ['Ana', 'Beto', 'Carla']) gente.push(await alta(quien));
  const conv = await admin.post(`/offerings/${j.cuerpo.id}/enroll`, { userIds: gente.filter(Boolean) });
  if (!conv.ok) mal(`${nombre}: convocar ${conv.estado} ${JSON.stringify(conv.cuerpo).slice(0, 200)}`);
  return j.cuerpo.id;
}

const enlaces = [];

paso(1, 'PROPIA — la dicta la empresa: la lista solo pregunta quien vino');
const propia = await montar({
  tipo: tipos.find((t) => t.code === 'CAPACITACION_EXTRAORDINARIA') ?? tipos[0],
  nombre: 'Charla de seguridad vial (propia)', indice: 1, papelDeTercero: false,
});
if (propia) {
  const id = await jornadaConGente({ versionId: propia.versionId, nombre: 'propia', quienLaDicta: null, hora: '08:00' });
  if (id) { ok('jornada PROPIA publicada con 3 personas'); enlaces.push(['Propia (sin papel de tercero)', id]); }
}

paso(2, 'DE UN TERCERO — la dicta la ARL y la formacion lleva certificado');
const externa = await montar({
  tipo: tipos.find((t) => t.code === 'RECERTIFICACION') ?? tipos[0],
  nombre: 'Habilitacion de montacargas (ARL)', indice: 2, papelDeTercero: null,
});
if (externa) {
  const id = await jornadaConGente({ versionId: externa.versionId, nombre: 'externa', quienLaDicta: 'ARL Sura', hora: '10:00' });
  if (id) { ok('jornada de UN TERCERO publicada: pedira numero y vencimiento, y la entidad saldra sola'); enlaces.push(['De un tercero (ARL Sura)', id]); }
}

paso(3, 'QUE CERTIFICA — emite constancia propia al cerrar por asistencia');
const certifica = await montar({
  tipo: tipos.find((t) => t.code === 'CAPACITACION_DEL_PLAN') ?? tipos[0],
  nombre: 'Manejo defensivo (con constancia)', indice: 3, papelDeTercero: false,
});
if (certifica) {
  const id = await jornadaConGente({ versionId: certifica.versionId, nombre: 'certifica', quienLaDicta: null, hora: '14:00' });
  if (id) { ok('jornada QUE CERTIFICA publicada: al marcar asistencia emite la constancia'); enlaces.push(['Que certifica (constancia propia)', id]); }
}

console.log('\n─────────────────────────────────────────────────────────────');
console.log('Abre cualquiera de estas y pulsa "Tomar asistencia":\n');
for (const [que, id] of enlaces) console.log(`  ${que}\n    http://localhost:3200/convocatorias/${id}\n`);
console.log(`Todo lo creado lleva el sufijo ${SUFIJO}.`);
