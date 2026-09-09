// RECORRIDO: LA MATRIZ COMPLETA DE LA MARCA DE ASISTENCIA.
//
// ─── LA PREGUNTA QUE LO ORIGINA ───
//
// La hizo el cliente el 2026-09-07, y es la buena: *"al cambiar de asistio a no por error, cuando ya
// se cumplio... ¿que pasa?"*. La respuesta corta —"no se reabre"— estaba medida en un solo caso.
// Este recorrido la mide en TODOS: **cada estado inicial posible por cada marca posible**.
//
// ─── LOS DOS HECHOS QUE HAY QUE TENER SEPARADOS PARA ENTENDER LA TABLA ───
//
//   · `enrollments.completedAt`   si la formacion esta CUMPLIDA. Es lo que cuenta para el plan, el
//                                 informe y la constancia. Una vez puesto, no se quita desde aqui.
//   · `attendance_records.status` lo que dice el ACTA de esa jornada: asistio / no / justificada.
//                                 Se re-marca sin miedo, es un `upsert` sobre (jornada, persona).
//
// Son dos cosas distintas a proposito —una persona puede cumplir en la plataforma sin pisar el
// salon— y la mitad de las sorpresas de esta pantalla salen de leerlos como si fueran uno.
//
// ─── LOS CINCO ESTADOS INICIALES × LAS TRES MARCAS ───
//
//   A. SIN MARCAR              recien inscrito, nadie ha tomado lista
//   B. NO ASISTIO              marcado ABSENT en una pasada anterior
//   C. FALTA JUSTIFICADA       marcado JUSTIFIED con su motivo
//   D. CUMPLIDA POR ASISTENCIA marcado PRESENT: cerro la formacion
//   E. CUMPLIDA EN PLATAFORMA  hizo el contenido y el examen; nunca estuvo en el salon
//
// Y ademas los bordes que no son una casilla: el papel de un tercero en sus cuatro variantes, la
// justificacion sin motivo, y el certificado con fecha imposible.
//
//   node scripts/recorridos/asistencia-combinaciones.mjs
import { crearCliente, paso, ok, mal, comprobar, resumen } from './api.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;
const fecha = new Date().toISOString().slice(0, 10);
const venceBien = new Date(Date.now() + 330 * 86400000).toISOString().slice(0, 10);
const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(1, 'MONTAJE: una formacion que lleva papel de tercero, y una jornada que se cierra con lista');

const tipos = (await admin.get('/catalogs/activity-types')).cuerpo ?? [];
const tipo = tipos.find((t) => t.code === 'RECERTIFICACION');
comprobar(!!tipo?.config?.tracksExternalCertificate, 'el tipo Recertificacion lleva papel de un tercero', 'falta ese tipo');
if (!tipo) { resumen(); process.exit(1); }

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

async function montarFormacion(codigo, nombre, tipoId) {
  const ficha = await admin.post('/activities', {
    code: `${codigo}_${SUFIJO}`, name: `${nombre} ${SUFIJO}`,
    description: 'Matriz de estados de la lista de asistencia.',
    activityTypeId: tipoId, processId: proceso.id, modality: 'PRESENCIAL',
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

  // El tipo exige evaluacion: sin ella la compuerta de la Decision #74 no deja publicar.
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
  return { activityId, versionId };
}

const conPapel = await montarFormacion('MTZ', 'Recertificacion matriz', tipo.id);
comprobar(!!conPapel.activityId, 'formacion con papel de tercero, publicada y exigida al cargo', 'no se pudo montar');
if (!conPapel.activityId) { resumen(); process.exit(1); }

const jornada = await admin.post('/offerings', {
  activityVersionId: conPapel.versionId, kind: 'EVENT', modality: 'PRESENCIAL',
  scheduledDate: fecha, startTime: '08:00', endTime: '12:00', location: `Salon ${SUFIJO}`,
  executedBy: 'ARL', executedByOther: 'ARL Sura', capacity: 40,
  intensityTheoryHours: 2, intensityPracticeHours: 2,
});
const offeringId = jornada.cuerpo?.id;
await admin.post(`/offerings/${offeringId}/publish`, { confirm: true });
comprobar(!!offeringId, 'jornada publicada, se cierra con lista', `jornada: ${jornada.estado}`);

const detalle = (await admin.get(`/offerings/${offeringId}`)).cuerpo;
comprobar(detalle?.admiteAsistencia === true, 'el servidor confirma que admite lista de asistencia', `admiteAsistencia=${detalle?.admiteAsistencia}`);

let contador = 0;
async function alta(nombre) {
  contador += 1;
  const doc = `MT${marca}${contador}`;
  const r = await admin.post('/users', {
    documentNumber: doc, fullName: `${nombre} ${SUFIJO}`,
    email: `${doc.toLowerCase()}@recorrido.test`, jobTitleId: cargo.id, areaId: area.id,
  });
  return { id: r.cuerpo?.id ?? r.cuerpo?.user?.id, doc, clave: r.cuerpo?.generatedPassword ?? r.cuerpo?.password };
}
const lista = () => admin.get(`/offerings/${offeringId}/roster`).then((r) => r.cuerpo?.items ?? []);
const filaDe = async (uid) => (await lista()).find((f) => f.user?.id === uid);
const marcar = (items) => admin.post(`/offerings/${offeringId}/attendance`, { heldOn: fecha, items });
const obligacionDe = async (uid) =>
  ((await admin.get(`/assignments?targetId=${conPapel.activityId}&userId=${uid}&pageSize=50`)).cuerpo?.items ?? [])
    .find((a) => a.status === 'COMPLETED') ?? null;
const constanciasDe = async (persona) => {
  const cliente = crearCliente();
  try { await cliente.entrar(persona.doc, persona.clave); } catch { return null; }
  const r = (await cliente.get('/me/certificados')).cuerpo;
  const items = r?.items ?? r ?? [];
  return Array.isArray(items) ? items.filter((c) => (c.activityName ?? '').includes(SUFIJO)).length : null;
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(2, 'LOS CINCO ESTADOS INICIALES, uno por persona y por combinacion');

/** Deja a una persona nueva, inscrita en la jornada, en el estado que se pida. */
async function sembrar(estado, etiqueta) {
  const persona = await alta(etiqueta);
  await admin.post(`/offerings/${offeringId}/enroll`, { userIds: [persona.id] });
  const fila = await filaDe(persona.id);
  if (estado === 'SIN_MARCAR') return { persona, enrollmentId: fila?.id };
  if (estado === 'AUSENTE') await marcar([{ enrollmentId: fila.id, estado: 'ABSENT' }]);
  if (estado === 'JUSTIFICADA') await marcar([{ enrollmentId: fila.id, estado: 'JUSTIFIED', motivo: 'Incapacidad medica' }]);
  if (estado === 'CUMPLIDA_LISTA') await marcar([{ enrollmentId: fila.id, estado: 'PRESENT' }]);
  if (estado === 'CUMPLIDA_PLATAFORMA') {
    /*
      LA QUINTA, QUE NO SE MONTA CON LA LISTA sino haciendo el curso de verdad. Es el unico camino
      para llegar a "cumplida SIN marca de asistencia", que es el caso que la pantalla trata aparte:
      a esta persona no se le tocan los campos del certificado, porque mandarlos escribiria un acta
      diciendo que estuvo en un salon donde no estuvo.
    */
    const aprendiz = crearCliente();
    await aprendiz.entrar(persona.doc, persona.clave);
    const curso = (await aprendiz.get(`/me/enrollments/${fila.id}`)).cuerpo;
    const piezas = curso?.contents ?? curso?.version?.contents ?? [];
    const leccion = piezas.find((c) => c.type === 'LESSON');
    if (leccion) await aprendiz.post(`/me/contents/${leccion.id}/progress`, { pct: 100, secondsSpent: 60, source: 'DECLARED' });
    const examenPieza = piezas.find((c) => c.type === 'ASSESSMENT');
    const examenId = examenPieza?.assessmentId ?? examenPieza?.assessment?.id;
    const intento = await aprendiz.post(`/me/enrollments/${fila.id}/attempts?assessmentId=${examenId}`, {});
    const attemptId = intento.cuerpo?.id ?? intento.cuerpo?.attempt?.id;
    const preguntas = intento.cuerpo?.questions ?? (await aprendiz.get(`/me/attempts/${attemptId}`)).cuerpo?.questions ?? [];
    for (const p of preguntas) {
      await aprendiz.post(`/me/attempts/${attemptId}/answers`, { attemptQuestionId: p.attemptQuestionId, answer: { optionId: 'a' } });
    }
    await aprendiz.post(`/me/attempts/${attemptId}/submit`, {});
  }
  return { persona, enrollmentId: fila?.id };
}

const ESTADOS = [
  ['SIN_MARCAR', 'Sin marcar', 'sin marca de asistencia y sin cumplir'],
  ['AUSENTE', 'No asistio', 'marcada AUSENTE, sin cumplir'],
  ['JUSTIFICADA', 'Justificada', 'marcada JUSTIFICADA, sin cumplir'],
  ['CUMPLIDA_LISTA', 'Cumplida lista', 'CUMPLIDA por la lista'],
  ['CUMPLIDA_PLATAFORMA', 'Cumplida plataforma', 'CUMPLIDA en la plataforma, sin acta'],
];
const ACCIONES = [
  ['PRESENT', 'asistio'],
  ['ABSENT', 'no asistio'],
  ['JUSTIFIED', 'justificada'],
];

/*
  LO QUE SE ESPERA DE CADA CASILLA, escrito ANTES de correr nada.

  Es la unica forma de que esta matriz sirva: si se escribiera mirando el resultado, confirmaria lo
  que hace el sistema en vez de comprobar lo que debe hacer. Las tres reglas de las que sale todo:

    1. Una formacion CUMPLIDA no se reabre desde la lista, se mande lo que se mande.
    2. Una formacion NO cumplida se cierra si —y solo si— se marca PRESENT.
    3. El acta se re-marca SIEMPRE, cumplida o no: es el registro de lo que paso en el salon, y
       corregir a quien se apunto mal no puede exigir tocar la base a mano.

  De la 1 y la 3 juntas sale la casilla incomoda —cumplida + ABSENT— que es justo por la que
  pregunto el cliente: el acta dice que no vino y el expediente que cumplio. No es un fallo del
  motor; es que deshacer un cumplimiento es ANULAR, y eso no existe todavia. Por eso la pantalla
  enseña el estado de los cumplidos como TEXTO y no deja tocarlo.
*/
function loEsperado(estado, accion) {
  const yaCumplida = estado === 'CUMPLIDA_LISTA' || estado === 'CUMPLIDA_PLATAFORMA';
  return {
    cumplida: yaCumplida || accion === 'PRESENT',
    // Regla 3: el acta guarda siempre lo ultimo que se mando.
    acta: accion,
    // Solo se emite constancia cuando se cierra algo NUEVO. Nunca dos.
    constancias: 1,
    cierraAhora: !yaCumplida && accion === 'PRESENT',
  };
}

const resultados = [];
for (const [estado, etiqueta, describe] of ESTADOS) {
  for (const [accion] of ACCIONES) {
    const { persona, enrollmentId } = await sembrar(estado, `${etiqueta} ${accion}`);
    const antes = await filaDe(persona.id);
    const r = await marcar([
      { enrollmentId, estado: accion, ...(accion === 'JUSTIFIED' ? { motivo: 'Correccion del acta' } : {}) },
    ]);
    const despues = await filaDe(persona.id);
    const esperado = loEsperado(estado, accion);
    const constancias = await constanciasDe(persona);
    const obligacion = await obligacionDe(persona.id);

    const cumplidaOk = Boolean(despues?.completedAt) === esperado.cumplida;
    const actaOk = despues?.attendanceStatus === esperado.acta;
    const noReabre = !antes?.completedAt || Boolean(despues?.completedAt);
    const constanciasOk = esperado.cumplida ? constancias === 1 : constancias === 0;
    const obligacionOk = esperado.cumplida ? obligacion !== null : obligacion === null;

    resultados.push({
      estado, accion, describe,
      ok: r.ok && cumplidaOk && actaOk && noReabre && constanciasOk && obligacionOk,
      detalle: `cumplida=${Boolean(despues?.completedAt)}(esp ${esperado.cumplida}) acta=${despues?.attendanceStatus}(esp ${esperado.acta}) constancias=${constancias}(esp ${esperado.cumplida ? 1 : 0}) obligacionCerrada=${obligacion !== null}`,
    });
  }
}

console.log('');
console.log('   ESTADO INICIAL         SE MARCA       ->  QUEDA');
console.log('   ' + '─'.repeat(92));
for (const r of resultados) {
  const icono = r.ok ? 'OK  ' : 'MAL ';
  console.log(`   ${icono} ${r.estado.padEnd(21)} ${r.accion.padEnd(12)} ->  ${r.detalle}`);
  if (!r.ok) mal(`${r.estado} + ${r.accion}: ${r.detalle}`);
}
console.log('');
comprobar(
  resultados.every((r) => r.ok),
  `las ${resultados.length} combinaciones de estado inicial por marca se comportan como debe`,
  `${resultados.filter((r) => !r.ok).length} de ${resultados.length} combinaciones no cuadran`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(3, 'LA CASILLA POR LA QUE PREGUNTO EL CLIENTE, con su consecuencia escrita');

const contradictoria = resultados.find((r) => r.estado === 'CUMPLIDA_LISTA' && r.accion === 'ABSENT');
comprobar(
  contradictoria?.ok,
  'cumplida + "no asistio": la formacion SIGUE cumplida y el acta SI cambia',
  `no se comporto asi: ${contradictoria?.detalle}`,
);
ok('el acta dice que no vino y el expediente que cumplio: por eso la pantalla no ofrece este cambio');
ok('deshacerlo de verdad es ANULAR —reabrir, revocar la constancia y devolver la obligacion— y no existe');

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(4, 'EL PAPEL DE UN TERCERO, en sus cuatro variantes');

// (a) Papel completo sobre alguien sin cumplir: cierra, guarda y su fecha manda en la obligacion.
{
  const { persona, enrollmentId } = await sembrar('SIN_MARCAR', 'Papel completo');
  const r = await marcar([{ enrollmentId, estado: 'PRESENT', certificate: { number: `FULL-${marca}`, validUntil: venceBien } }]);
  const fila = await filaDe(persona.id);
  const obligacion = await obligacionDe(persona.id);
  const enBogota = (iso) => (iso ? new Date(new Date(iso).getTime() - 5 * 3600000).toISOString().slice(0, 10) : null);
  comprobar(
    r.ok && fila?.extCertNumber === `FULL-${marca}` && fila?.extCertIssuer === 'ARL Sura',
    'con numero y vencimiento: cierra, guarda el numero y el emisor sale de la jornada',
    `${r.estado} numero=${fila?.extCertNumber} emisor=${fila?.extCertIssuer}`,
  );
  comprobar(
    enBogota(obligacion?.validUntilOverride) === venceBien,
    `y la fecha del papel MANDA en la obligacion (${venceBien})`,
    `validUntilOverride=${enBogota(obligacion?.validUntilOverride)}`,
  );
}

// (b) Solo el numero, sin vencimiento: se acepta, y no inventa fecha.
{
  const { persona, enrollmentId } = await sembrar('SIN_MARCAR', 'Papel sin fecha');
  const r = await marcar([{ enrollmentId, estado: 'PRESENT', certificate: { number: `SOLO-${marca}` } }]);
  const fila = await filaDe(persona.id);
  comprobar(
    r.ok && fila?.extCertNumber === `SOLO-${marca}` && !fila?.extCertValidUntil,
    'solo el numero: se guarda y NO se inventa un vencimiento',
    `${r.estado} numero=${fila?.extCertNumber} vence=${fila?.extCertValidUntil}`,
  );
}

// (c) Papel sobre alguien AUSENTE: no tiene sentido y no debe guardarse nada suyo.
{
  const { persona, enrollmentId } = await sembrar('SIN_MARCAR', 'Papel de ausente');
  const r = await marcar([{ enrollmentId, estado: 'ABSENT', certificate: { number: `AUSENTE-${marca}` } }]);
  const fila = await filaDe(persona.id);
  comprobar(
    !fila?.completedAt && !fila?.extCertNumber,
    'un papel mandado con AUSENTE no cierra ni se guarda: quien no vino no tiene certificado de esta jornada',
    `${r.estado} cumplida=${Boolean(fila?.completedAt)} numero=${fila?.extCertNumber}`,
  );
}

// (d) Papel que vence ANTES de la jornada: se rechaza el lote entero.
{
  const { persona, enrollmentId } = await sembrar('SIN_MARCAR', 'Papel caduco');
  const r = await marcar([{ enrollmentId, estado: 'PRESENT', certificate: { number: `VIEJO-${marca}`, validUntil: ayer } }]);
  const fila = await filaDe(persona.id);
  comprobar(
    !r.ok && r.cuerpo?.code === 'CERT_EXPIRES_BEFORE_SESSION',
    `se rechaza un papel que vence antes de la jornada (${ayer} < ${fecha})`,
    `lo acepto: ${r.estado} ${JSON.stringify(r.cuerpo).slice(0, 140)}`,
  );
  comprobar(!fila?.completedAt, 'y no cierra a nadie: la lista se acepta entera o no se acepta', `quedo cumplida`);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(5, 'LA JUSTIFICACION SIN MOTIVO, y el motivo que se guarda');

{
  const { persona, enrollmentId } = await sembrar('SIN_MARCAR', 'Sin motivo');
  const sin = await marcar([{ enrollmentId, estado: 'JUSTIFIED' }]);
  comprobar(!sin.ok, 'una falta justificada SIN motivo se rechaza', `la acepto: ${sin.estado}`);

  const con = await marcar([{ enrollmentId, estado: 'JUSTIFIED', motivo: 'Incapacidad del 4 al 8' }]);
  const fila = await filaDe(persona.id);
  comprobar(
    con.ok && fila?.attendanceNote === 'Incapacidad del 4 al 8',
    `con motivo se guarda tal cual: "${fila?.attendanceNote}"`,
    `${con.estado} nota=${fila?.attendanceNote}`,
  );
  comprobar(!fila?.completedAt, 'y una falta justificada NO exime: la sigue debiendo', 'la justificacion cerro la formacion');
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(6, 'UN PAPEL EN UNA FORMACION QUE NO LO LLEVA');

{
  const pildora = tipos.find((t) => t.config?.tracksExternalCertificate !== true && t.config?.requiresAssessment !== true);
  if (!pildora) {
    ok('no hay un tipo sin papel y sin examen con el que probarlo: se salta');
  } else {
    const otra = await admin.post('/activities', {
      code: `NOPAP_${SUFIJO}`, name: `Sin papel ${SUFIJO}`,
      activityTypeId: pildora.id, processId: proceso.id, modality: 'PRESENCIAL',
    });
    const vId = ((await admin.get(`/activities/${otra.cuerpo?.id}`)).cuerpo?.versions ?? []).find((v) => v.status === 'DRAFT')?.id;
    const lec = await admin.post('/lessons', { title: `Pildora ${SUFIJO}`, estimatedMinutes: 3 });
    await admin.pedir(`/lessons/${lec.cuerpo.id}/cards`, {
      method: 'PUT',
      body: JSON.stringify({ cards: [{ payload: { cardType: 'TEXT_IMAGE', title: 'Nota', body: 'Contenido breve.' } }] }),
    });
    await admin.post(`/activities/versions/${vId}/contents`, { type: 'LESSON', title: 'Contenido', isRequired: true, config: { minSeconds: 1 }, lessonId: lec.cuerpo.id });
    await admin.post(`/activities/versions/${vId}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
    const j2 = await admin.post('/offerings', {
      activityVersionId: vId, kind: 'EVENT', modality: 'PRESENCIAL',
      scheduledDate: fecha, startTime: '14:00', endTime: '15:00', location: `Aula ${SUFIJO}`, capacity: 5,
    });
    await admin.post(`/offerings/${j2.cuerpo?.id}/publish`, { confirm: true });
    const p = await alta('Sin papel');
    await admin.post(`/offerings/${j2.cuerpo?.id}/enroll`, { userIds: [p.id] });
    const f2 = ((await admin.get(`/offerings/${j2.cuerpo?.id}/roster`)).cuerpo?.items ?? [])[0];
    const r = await admin.post(`/offerings/${j2.cuerpo?.id}/attendance`, {
      heldOn: fecha, items: [{ enrollmentId: f2?.id, estado: 'PRESENT', certificate: { number: `NOVA-${marca}` } }],
    });
    comprobar(
      !r.ok && r.cuerpo?.code === 'TYPE_DOES_NOT_TRACK_EXTERNAL_CERT',
      'una formacion que no lleva papel de tercero rechaza el certificado, desde el SERVIDOR',
      `lo acepto: ${r.estado} ${JSON.stringify(r.cuerpo).slice(0, 140)}`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(7, 'LA LISTA ENTERA DE UNA VEZ: los tres estados mezclados en un solo envio');

{
  const gente = [];
  for (const n of ['Lote asistio', 'Lote falto', 'Lote justificada']) {
    const p = await alta(n);
    gente.push(p);
  }
  await admin.post(`/offerings/${offeringId}/enroll`, { userIds: gente.map((g) => g.id) });
  const filas = [];
  for (const g of gente) filas.push(await filaDe(g.id));
  const r = await marcar([
    { enrollmentId: filas[0].id, estado: 'PRESENT', certificate: { number: `LOTE-${marca}`, validUntil: venceBien } },
    { enrollmentId: filas[1].id, estado: 'ABSENT' },
    { enrollmentId: filas[2].id, estado: 'JUSTIFIED', motivo: 'Vacaciones programadas' },
  ]);
  comprobar(
    r.ok && r.cuerpo?.cerradas === 1 && r.cuerpo?.ausentes === 2 && r.cuerpo?.justificados === 1,
    `un solo envio con los tres estados: cierra 1, deja 2 debiendo (1 justificado)`,
    `${r.estado} ${JSON.stringify(r.cuerpo)}`,
  );
  const tras = [];
  for (const g of gente) tras.push(await filaDe(g.id));
  comprobar(
    Boolean(tras[0]?.completedAt) && !tras[1]?.completedAt && !tras[2]?.completedAt,
    'y cada quien queda como le corresponde, sin contagiarse del de al lado',
    tras.map((t, i) => `${i}:${Boolean(t?.completedAt)}`).join(' '),
  );
}

console.log(`\nCREADO PARA LIMPIAR: sufijo=${SUFIJO} · se saca con "pnpm --filter @neo-pulse/api dev:limpiar-pruebas -- --si"`);
process.exit(resumen() === 0 ? 0 : 1);
