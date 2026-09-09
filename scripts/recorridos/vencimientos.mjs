// RECORRIDO: VENCIMIENTOS — LAS FUENTES DE VERDAD, EL EJE NUEVO Y EL AVISO (`PENDIENTES` 3.1-3.3).
//
// ─── LO QUE ESTABA MAL ───
//
// El informe partia por DE DONDE SALIA EL DATO: «Certificacion» leia `certification_grants` y
// «Obligacion» leia `assignments`. Eso es una division del esquema, no del trabajo, y tenia dos
// consecuencias visibles:
//
//   1. `certification_grants` NO LA ESCRIBE NADIE, asi que esa serie salia siempre en cero mientras
//      las fechas de caducidad existian de verdad en otras dos columnas.
//   2. A quien esta en su ventana de 60 dias —el papel le caduca en marzo y la ronda siguiente ya le
//      nacio— se le contaba en las DOS series. El mismo trabajo, dos veces.
//
// Ahora el eje es lo que hay que HACER: REPROGRAMAR (ya la tuvo y deja de estar acreditado) frente a
// PERSEGUIR (nunca la ha cumplido y tiene plazo). Y cada persona y formacion sale UNA vez.
//
// ─── LO QUE COMPRUEBA ───
//
//   1. Las tres fuentes reales aparecen: el papel de un tercero, la constancia propia y el plazo de
//      la obligacion abierta.
//   2. Quien ya la tuvo sale como REPROGRAMAR; quien nunca, como PERSEGUIR.
//   3. La ventana de 60 dias no cuenta dos veces: una sola fila por persona y formacion.
//   4. La fecha del PAPEL manda sobre la que calcularia la recurrencia.
//   5. El calendario y el resumen cuadran con la lista nominal — un grafico que no cuadra con su
//      tabla no lo usa nadie dos veces.
//   6. Y el aviso llega a la bandeja de quien puede hacer algo, diciendo las dos cifras por
//      separado y nunca la suma.
//
//   node scripts/recorridos/vencimientos.mjs
import { crearCliente, paso, ok, comprobar, resumen } from './api.mjs';

const enBogota = (iso) => (iso ? new Date(new Date(iso).getTime() - 5 * 3600000).toISOString().slice(0, 10) : null);

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;
const hoy = new Date().toISOString().slice(0, 10);
// Dentro del horizonte del informe (24 meses) y del aviso, para poder comprobar las dos cosas.
const venceElPapel = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(1, 'MONTAJE: una formacion que caduca, con papel de un tercero y con constancia propia');

const tipos = (await admin.get('/catalogs/activity-types')).cuerpo ?? [];
const tipo = tipos.find(
  (t) =>
    t.active !== false &&
    t.code !== 'MICROLEARNING' &&
    t.config?.participatesInPlan !== true &&
    t.config?.tracksExternalCertificate === true,
);
comprobar(!!tipo, `tipo con papel de un tercero: ${tipo?.code}`, 'no hay ningun tipo que lleve papel fuera del plan');
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
  code: `VENC_${SUFIJO}`, name: `Caduca cada año ${SUFIJO}`,
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

// RECURRENCIA DE 12 MESES: es lo que hace que su constancia caduque. Sin recurrencia la constancia
// no vence —una induccion que se hace una vez acredita para siempre que se hizo— y no habria nada
// que reprogramar (Decision #111).
await admin.post(`/activities/${activityId}/requirements`, {
  scope: { match: 'ALL', jobTitleIds: [cargo.id] },
  trigger: 'ON_JOIN', dueDaysAfterTrigger: 30, everyMonths: 12, soloNuevos: true,
});

const jornada = await admin.post('/offerings', {
  activityVersionId: versionId, kind: 'EVENT', modality: 'PRESENCIAL',
  scheduledDate: hoy, startTime: '08:00', endTime: '12:00', location: `Salon ${SUFIJO}`,
  executedBy: 'ARL', executedByOther: 'ARL Colmena', capacity: 10,
  intensityTheoryHours: 2, intensityPracticeHours: 2,
});
const offeringId = jornada.cuerpo?.id;
await admin.post(`/offerings/${offeringId}/publish`, { confirm: true });

let n = 0;
async function alta(nombre) {
  n += 1;
  const doc = `VE${marca}${n}`;
  const r = await admin.post('/users', {
    documentNumber: doc, fullName: `${nombre} ${SUFIJO}`,
    email: `${doc.toLowerCase()}@recorrido.test`, jobTitleId: cargo.id, areaId: area.id,
  });
  return { id: r.cuerpo?.id ?? r.cuerpo?.user?.id, doc };
}

const conPapel = await alta('Trae papel de la ARL');
const conConstancia = await alta('Solo constancia propia');
const sinHacer = await alta('Todavia la debe');

await admin.post(`/offerings/${offeringId}/enroll`, { userIds: [conPapel.id, conConstancia.id] });
const roster = () => admin.get(`/offerings/${offeringId}/roster`).then((r) => r.cuerpo?.items ?? []);
const filaDe = async (uid) => (await roster()).find((f) => f.user?.id === uid);

await admin.post(`/offerings/${offeringId}/attendance`, {
  heldOn: hoy,
  items: [
    { enrollmentId: (await filaDe(conPapel.id))?.id, estado: 'PRESENT' },
    { enrollmentId: (await filaDe(conConstancia.id))?.id, estado: 'PRESENT' },
  ],
});
comprobar(
  Boolean((await filaDe(conPapel.id))?.completedAt) && Boolean((await filaDe(conConstancia.id))?.completedAt),
  'dos personas la cumplen; una tercera la debe',
  'alguna no quedo cumplida',
);

// A una se le registra el papel del tercero, con una fecha que NO es la que calcularia la recurrencia.
const inscripcion = (await filaDe(conPapel.id))?.id;
const guardado = await admin.patch(`/enrollments/${inscripcion}/papel-de-tercero`, {
  number: `ARL-${marca}`,
  validUntil: venceElPapel,
});
comprobar(guardado.ok, `se registra el papel, vigente hasta ${venceElPapel}`, `${guardado.estado} ${JSON.stringify(guardado.cuerpo).slice(0, 160)}`);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(2, 'EL INFORME: las tres fuentes, y el eje que dice que hacer');

const informe = (await admin.get('/reportes/vencimientos?meses=24')).cuerpo;
const mias = (informe?.items ?? []).filter((f) => f.formacion?.includes(SUFIJO));
const de = (persona) => mias.filter((f) => f.personaId === persona.id);

const filaPapel = de(conPapel)[0];
comprobar(
  de(conPapel).length === 1,
  'quien tiene papel sale UNA vez',
  `sale ${de(conPapel).length} vece(s): ${JSON.stringify(de(conPapel).map((f) => [f.clase, f.fuente]))}`,
);
comprobar(filaPapel?.clase === 'REPROGRAMAR', 'y como REPROGRAMAR: ya la tuvo', `clase=${filaPapel?.clase}`);
comprobar(filaPapel?.fuente === 'PAPEL_DE_TERCERO', 'diciendo que la fecha sale del papel', `fuente=${filaPapel?.fuente}`);
comprobar(
  enBogota(filaPapel?.fecha) === venceElPapel,
  `con la fecha del papel (${venceElPapel}) y no la de la recurrencia`,
  `fecha=${enBogota(filaPapel?.fecha)} — la recurrencia habria dicho dentro de 12 meses`,
);

const filaConstancia = de(conConstancia)[0];
comprobar(
  de(conConstancia).length === 1,
  'quien solo tiene constancia propia tambien sale una vez',
  `sale ${de(conConstancia).length} vece(s)`,
);
comprobar(
  filaConstancia?.clase === 'REPROGRAMAR' && filaConstancia?.fuente === 'CONSTANCIA',
  'como REPROGRAMAR, y por su CONSTANCIA — la serie que antes salia siempre en cero',
  `clase=${filaConstancia?.clase} fuente=${filaConstancia?.fuente}`,
);

const filaPendiente = de(sinHacer)[0];
comprobar(
  filaPendiente?.clase === 'PERSEGUIR' && filaPendiente?.fuente === 'OBLIGACION_ABIERTA',
  'y quien nunca la ha hecho sale como PERSEGUIR, por el plazo de su obligacion',
  `clase=${filaPendiente?.clase} fuente=${filaPendiente?.fuente}`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(3, 'EL GRAFICO CUADRA CON SU TABLA');

const total = (informe?.calendario ?? []).reduce((suma, mes) => suma + mes.total, 0);
comprobar(
  total === (informe?.items ?? []).length,
  `el calendario suma ${total} y la lista trae ${(informe?.items ?? []).length}`,
  `no cuadran: ${total} contra ${(informe?.items ?? []).length}`,
);
const porClase = (informe?.calendario ?? []).reduce(
  (acc, mes) => ({ reprogramar: acc.reprogramar + mes.reprogramar, perseguir: acc.perseguir + mes.perseguir }),
  { reprogramar: 0, perseguir: 0 },
);
const enLaLista = (informe?.items ?? []).reduce(
  (acc, fila) => ({
    reprogramar: acc.reprogramar + (fila.clase === 'REPROGRAMAR' ? 1 : 0),
    perseguir: acc.perseguir + (fila.clase === 'PERSEGUIR' ? 1 : 0),
  }),
  { reprogramar: 0, perseguir: 0 },
);
comprobar(
  porClase.reprogramar === enLaLista.reprogramar && porClase.perseguir === enLaLista.perseguir,
  `las dos series cuadran: ${porClase.reprogramar} por reprogramar y ${porClase.perseguir} por perseguir`,
  `grafico=${JSON.stringify(porClase)} lista=${JSON.stringify(enLaLista)}`,
);
comprobar(
  informe?.resumen?.total === (informe?.items ?? []).length,
  'y el resumen de arriba cuenta lo mismo que la lista',
  `resumen=${informe?.resumen?.total} lista=${(informe?.items ?? []).length}`,
);

const parejas = new Map();
for (const fila of informe?.items ?? []) {
  const clave = `${fila.personaId}|${fila.actividadId ?? fila.formacion}`;
  parejas.set(clave, (parejas.get(clave) ?? 0) + 1);
}
comprobar(
  [...parejas.values()].every((cuantas) => cuantas === 1),
  `ninguna de las ${parejas.size} parejas persona+formacion del informe entero sale dos veces`,
  `repetidas: ${JSON.stringify([...parejas.entries()].filter(([, c]) => c > 1).slice(0, 5))}`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(4, 'Y EL AVISO LLEGA A LA BANDEJA, que es lo que faltaba del todo');

const avisado = await admin.post('/reportes/vencimientos/avisar');
comprobar(avisado.ok, 'se puede disparar el aviso a mano, sin esperar al lunes', `${avisado.estado} ${JSON.stringify(avisado.cuerpo).slice(0, 160)}`);
comprobar(
  (avisado.cuerpo?.enviados ?? 0) > 0,
  `le llega a ${avisado.cuerpo?.enviados} persona(s) con permiso de ver reportes`,
  `enviados=${avisado.cuerpo?.enviados} motivo=${avisado.cuerpo?.motivo}`,
);

const bandeja = (await admin.get('/notifications')).cuerpo;
const aviso = (bandeja?.items ?? []).find((a) => a.eventType === 'EXPIRATIONS_DIGEST');
comprobar(!!aviso, 'y aparece en la bandeja de quien lo recibe', 'no esta en la bandeja');
comprobar(
  Boolean(aviso?.body?.includes('Reportes')),
  `el aviso dice donde mirar: "${aviso?.body?.slice(0, 90)}"`,
  `body=${aviso?.body}`,
);
comprobar(
  Boolean(aviso?.body?.includes('convocar')) || Boolean(aviso?.body?.includes('nunca la ha')),
  'y separa los dos trabajos en vez de dar una suma sin significado',
  `body=${aviso?.body}`,
);

console.log(`\nCREADO PARA LIMPIAR: sufijo=${SUFIJO}`);
process.exit(resumen() === 0 ? 0 : 1);
