// RECORRIDO: LA SEGUNDA PUERTA AL PAPEL DE UN TERCERO (`PENDIENTES` 2.2).
//
// ─── QUE CIERRA ───
//
// El certificado de la ARL llega quince dias despues de la jornada. Hasta hoy la unica forma de
// registrarlo era volver a la convocatoria: acordarse de cual de las cuarenta era, buscarla, abrir
// la lista y encontrar a la persona dentro. Pero la peticion nunca llega asi — llega con un nombre
// delante: *"acaba de llegar el certificado de alturas de Juan"*.
//
// ─── LO QUE COMPRUEBA ───
//
//   1. La lista de las formaciones de alguien que llevan papel: solo las que lo llevan y solo las
//      cerradas.
//   2. Que la cascada se respeta: una formacion que lo hereda del TIPO sin decirlo en su ficha
//      tambien sale (es el caso mayoritario y el que un `where` ingenuo se dejaria fuera).
//   3. Registrar el papel desde ahi: se guarda, y el emisor sale solo de quien dicto la jornada.
//   4. Y —lo que se olvido la primera vez en el otro camino— **la vigencia llega a la OBLIGACION**.
//   5. Las tres compuertas: formacion que no lleva papel, inscripcion sin cerrar, y fecha imposible.
//   6. Que NO toca lo que no le toca: ni el estado, ni la fecha de cumplimiento, ni el acta.
//
//   node scripts/recorridos/papel-desde-la-persona.mjs
import { crearCliente, paso, ok, mal, comprobar, resumen } from './api.mjs';

const enBogota = (iso) => (iso ? new Date(new Date(iso).getTime() - 5 * 3600000).toISOString().slice(0, 10) : null);

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;
const fecha = new Date().toISOString().slice(0, 10);
const vence = new Date(Date.now() + 300 * 86400000).toISOString().slice(0, 10);
const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(1, 'MONTAJE: una formacion que HEREDA el papel de su tipo, sin decirlo en su ficha');

const tipos = (await admin.get('/catalogs/activity-types')).cuerpo ?? [];
const conPapel = tipos.find((t) => t.code === 'RECERTIFICACION');
const sinPapel = tipos.find((t) => t.config?.tracksExternalCertificate !== true && t.config?.requiresAssessment !== true);
comprobar(!!conPapel, 'existe el tipo que lleva papel', 'falta RECERTIFICACION');
if (!conPapel) { resumen(); process.exit(1); }

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

async function montar({ tipo, codigo, nombre, conExamen }) {
  const ficha = await admin.post('/activities', {
    code: `${codigo}_${SUFIJO}`, name: `${nombre} ${SUFIJO}`,
    activityTypeId: tipo.id, processId: proceso.id, modality: 'PRESENCIAL',
  });
  const activityId = ficha.cuerpo?.id;
  const versionId = ((await admin.get(`/activities/${activityId}`)).cuerpo?.versions ?? []).find((v) => v.status === 'DRAFT')?.id;
  const lec = await admin.post('/lessons', { title: `Contenido ${nombre} ${SUFIJO}`, estimatedMinutes: 5 });
  await admin.pedir(`/lessons/${lec.cuerpo.id}/cards`, {
    method: 'PUT',
    body: JSON.stringify({ cards: [{ payload: { cardType: 'TEXT_IMAGE', title: 'Antes', body: 'Revision.' } }] }),
  });
  await admin.post(`/activities/versions/${versionId}/contents`, {
    type: 'LESSON', title: 'Contenido', isRequired: true, config: { minSeconds: 1 }, lessonId: lec.cuerpo.id,
  });
  if (conExamen) {
    const preg = await admin.post('/questions', {
      payload: {
        qtype: 'SINGLE', stem: 'Antes de operar...',
        options: [{ id: 'a', text: 'Se revisa' }, { id: 'b', text: 'Se arranca' }],
        correctOptionId: 'a', points: 1,
      },
    });
    const ex = await admin.post('/assessments', { title: `Examen ${nombre} ${SUFIJO}` });
    await admin.patch(`/assessments/${ex.cuerpo.id}`, {
      passingScore: 80, maxAttempts: 3, sections: [{ mode: 'FIXED', questionIds: [preg.cuerpo?.id] }],
    });
    await admin.post(`/activities/versions/${versionId}/contents`, {
      type: 'ASSESSMENT', title: 'Examen', isRequired: true, config: {}, assessmentId: ex.cuerpo.id,
    });
  }
  await admin.post(`/activities/versions/${versionId}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
  await admin.post(`/activities/${activityId}/requirements`, {
    scope: { match: 'ALL', jobTitleIds: [cargo.id] },
    trigger: 'ON_JOIN', dueDaysAfterTrigger: 30, everyMonths: 12, soloNuevos: true,
  });
  return { activityId, versionId };
}

/*
  LA FICHA NO DICE NADA de `tracksExternalCertificate`: lo HEREDA de su tipo. Es el caso
  mayoritario, y el que un filtro por columna en la consulta se dejaria fuera sin que nadie lo note.
*/
const recert = await montar({ tipo: conPapel, codigo: 'PERS', nombre: 'Recertificacion heredada', conExamen: true });
comprobar(!!recert.activityId, 'formacion creada, con el papel HEREDADO del tipo', 'no se pudo crear');

const jornada = await admin.post('/offerings', {
  activityVersionId: recert.versionId, kind: 'EVENT', modality: 'PRESENCIAL',
  scheduledDate: fecha, startTime: '08:00', endTime: '12:00', location: `Salon ${SUFIJO}`,
  executedBy: 'ARL', executedByOther: 'ARL Colmena', capacity: 10,
  intensityTheoryHours: 2, intensityPracticeHours: 2,
});
const offeringId = jornada.cuerpo?.id;
await admin.post(`/offerings/${offeringId}/publish`, { confirm: true });

let n = 0;
async function alta(nombre) {
  n += 1;
  const doc = `PP${marca}${n}`;
  const r = await admin.post('/users', {
    documentNumber: doc, fullName: `${nombre} ${SUFIJO}`,
    email: `${doc.toLowerCase()}@recorrido.test`, jobTitleId: cargo.id, areaId: area.id,
  });
  return { id: r.cuerpo?.id ?? r.cuerpo?.user?.id, doc };
}
const juan = await alta('Juan');
const pendiente = await alta('Todavia debe');
await admin.post(`/offerings/${offeringId}/enroll`, { userIds: [juan.id, pendiente.id] });
const lista = () => admin.get(`/offerings/${offeringId}/roster`).then((r) => r.cuerpo?.items ?? []);
const filaDe = async (uid) => (await lista()).find((f) => f.user?.id === uid);

// Juan asistio y cerro SIN papel: es el caso entero. El otro no vino.
await admin.post(`/offerings/${offeringId}/attendance`, {
  heldOn: fecha,
  items: [
    { enrollmentId: (await filaDe(juan.id))?.id, estado: 'PRESENT' },
    { enrollmentId: (await filaDe(pendiente.id))?.id, estado: 'ABSENT' },
  ],
});
const filaJuan = await filaDe(juan.id);
comprobar(Boolean(filaJuan?.completedAt) && !filaJuan?.extCertNumber, 'Juan cerro SIN papel, que es como llega el caso', `numero=${filaJuan?.extCertNumber}`);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(2, 'LA LISTA DESDE LA PERSONA: solo lo que lleva papel, y solo lo cerrado');

const suyas = await admin.get(`/enrollments/con-papel-de-tercero?userId=${juan.id}`);
comprobar(suyas.ok, 'la puerta responde', `${suyas.estado} ${JSON.stringify(suyas.cuerpo).slice(0, 160)}`);
const mia = (suyas.cuerpo ?? []).find((f) => f.actividad?.includes(SUFIJO));
comprobar(
  !!mia,
  'sale su recertificacion, aunque el papel lo HEREDE del tipo y su ficha no diga nada',
  `no aparece entre ${(suyas.cuerpo ?? []).length} fila(s)`,
);
comprobar(
  mia?.quienLaDicto === 'ARL Colmena',
  `y dice quien la dicto, que es el emisor por defecto: "${mia?.quienLaDicto}"`,
  `quienLaDicto=${mia?.quienLaDicto}`,
);
comprobar(!mia?.number, 'todavia sin numero, que es lo que se viene a poner', `numero=${mia?.number}`);

const delQueNoVino = await admin.get(`/enrollments/con-papel-de-tercero?userId=${pendiente.id}`);
comprobar(
  !(delQueNoVino.cuerpo ?? []).some((f) => f.actividad?.includes(SUFIJO)),
  'a quien NO asistio no se le ofrece registrar papel: primero se cierra su formacion',
  'aparece una formacion sin cerrar',
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(3, 'REGISTRAR EL PAPEL DESDE AHI, sin volver a la convocatoria');

const antes = await filaDe(juan.id);
const guardado = await admin.patch(`/enrollments/${mia.enrollmentId}/papel-de-tercero`, {
  number: `TARDE-${marca}`,
  validUntil: vence,
});
comprobar(guardado.ok, 'se guarda', `${guardado.estado} ${JSON.stringify(guardado.cuerpo).slice(0, 160)}`);

const tras = await filaDe(juan.id);
comprobar(tras?.extCertNumber === `TARDE-${marca}`, `el numero queda: ${tras?.extCertNumber}`, `numero=${tras?.extCertNumber}`);
comprobar(
  tras?.extCertIssuer === 'ARL Colmena',
  'y el emisor sale SOLO de quien dicto la jornada, sin teclearlo',
  `emisor=${tras?.extCertIssuer}`,
);
comprobar(
  tras?.completedAt === antes?.completedAt,
  'sin mover la fecha de cumplimiento: registrar un papel no vuelve a cerrar nada',
  `paso de ${antes?.completedAt} a ${tras?.completedAt}`,
);
comprobar(
  tras?.attendanceStatus === antes?.attendanceStatus,
  'ni su marca de asistencia',
  `paso de ${antes?.attendanceStatus} a ${tras?.attendanceStatus}`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(4, 'Y LA VIGENCIA LLEGA A LA OBLIGACION, que es la mitad que se olvido en el otro camino');

const obligacion = ((await admin.get(`/assignments?targetId=${recert.activityId}&userId=${juan.id}&pageSize=50`)).cuerpo?.items ?? [])
  .find((a) => a.status === 'COMPLETED');
comprobar(
  enBogota(obligacion?.validUntilOverride) === vence,
  `la obligacion recoge el vencimiento del papel (${vence})`,
  `validUntilOverride=${enBogota(obligacion?.validUntilOverride)} — el papel se guardaria y no moveria nada`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(5, 'LAS TRES COMPUERTAS');

// (a) Una fecha imposible: vence antes de haberse cumplido.
const imposible = await admin.patch(`/enrollments/${mia.enrollmentId}/papel-de-tercero`, {
  number: `MAL-${marca}`,
  validUntil: ayer,
});
comprobar(
  !imposible.ok && imposible.cuerpo?.code === 'CERT_EXPIRES_BEFORE_COMPLETION',
  `se rechaza un papel que vence antes de cumplirse la formacion (${ayer})`,
  `lo acepto: ${imposible.estado} ${JSON.stringify(imposible.cuerpo).slice(0, 140)}`,
);
const trasImposible = await filaDe(juan.id);
comprobar(
  trasImposible?.extCertNumber === `TARDE-${marca}`,
  'y no pisa lo que ya estaba bien guardado',
  `quedo ${trasImposible?.extCertNumber}`,
);

// (b) Una formacion que NO lleva papel.
if (sinPapel) {
  const otra = await montar({ tipo: sinPapel, codigo: 'NOPAP', nombre: 'Sin papel', conExamen: false });
  const j2 = await admin.post('/offerings', {
    activityVersionId: otra.versionId, kind: 'EVENT', modality: 'PRESENCIAL',
    scheduledDate: fecha, startTime: '14:00', endTime: '15:00', location: `Aula ${SUFIJO}`, capacity: 5,
  });
  await admin.post(`/offerings/${j2.cuerpo?.id}/publish`, { confirm: true });
  await admin.post(`/offerings/${j2.cuerpo?.id}/enroll`, { userIds: [juan.id] });
  const f2 = ((await admin.get(`/offerings/${j2.cuerpo?.id}/roster`)).cuerpo?.items ?? [])[0];
  await admin.post(`/offerings/${j2.cuerpo?.id}/attendance`, {
    heldOn: fecha, items: [{ enrollmentId: f2?.id, estado: 'PRESENT' }],
  });
  const rechazo = await admin.patch(`/enrollments/${f2?.id}/papel-de-tercero`, { number: `NOVA-${marca}` });
  comprobar(
    !rechazo.ok && rechazo.cuerpo?.code === 'TYPE_DOES_NOT_TRACK_EXTERNAL_CERT',
    'una formacion que no lleva papel lo rechaza tambien por esta puerta',
    `lo acepto: ${rechazo.estado} ${JSON.stringify(rechazo.cuerpo).slice(0, 140)}`,
  );
  const listaJuan = (await admin.get(`/enrollments/con-papel-de-tercero?userId=${juan.id}`)).cuerpo ?? [];
  comprobar(
    !listaJuan.some((f) => f.actividad?.includes('Sin papel')),
    'y ni siquiera se le ofrece: no sale en su lista',
    'aparece una formacion que no lleva papel',
  );
} else {
  ok('no hay un tipo sin papel y sin examen con el que probarlo: se salta');
}

// (c) Una inscripcion sin cerrar.
const delOtro = ((await admin.get(`/offerings/${offeringId}/roster`)).cuerpo?.items ?? []).find((f) => f.user?.id === pendiente.id);
const sinCerrar = await admin.patch(`/enrollments/${delOtro?.id}/papel-de-tercero`, { number: `PRONTO-${marca}` });
comprobar(
  !sinCerrar.ok && sinCerrar.cuerpo?.code === 'ENROLLMENT_NOT_CLOSED',
  'a una formacion sin cerrar no se le puede colgar un papel',
  `lo acepto: ${sinCerrar.estado} ${JSON.stringify(sinCerrar.cuerpo).slice(0, 140)}`,
);

console.log(`\nCREADO PARA LIMPIAR: sufijo=${SUFIJO}`);
process.exit(resumen() === 0 ? 0 : 1);
