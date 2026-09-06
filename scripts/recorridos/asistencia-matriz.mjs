// RECORRIDO TRANSVERSAL: LA ASISTENCIA EN TODOS LOS TIPOS, TODAS LAS MODALIDADES Y TODAS LAS
// FACETAS DEL ACOTAMIENTO — Y QUE LLEGA AL SEGUIMIENTO.
//
// ─── POR QUE ESTE Y NO SIETE RECORRIDOS, UNO POR TIPO ───
//
// Cerrar por asistencia **no depende del tipo**: depende del `kind` de la jornada. Siete archivos
// serian siete copias del mismo camino desincronizandose una a una, que es justo lo que ya evito
// `tajadas.mjs` recorriendo los siete tipos dentro de un solo archivo.
//
// Lo que SI cambia por tipo es lo que promete su configuracion —si emite constancia, si exige
// examen, si entra al plan, si lleva papel de tercero— y eso **no se escribe a mano aqui**: se
// DERIVA de `activity_types.config`, como hace `estandar.mjs`. Un cliente que cree su propio tipo
// queda cubierto el mismo dia, y cambiar la configuracion desde la pantalla cambia lo que se espera
// sin tocar esta prueba.
//
// ─── LAS TRES PARTES ───
//
//   A. POR TIPO. Una jornada por cada tipo que exista, con la modalidad rotando PRESENCIAL /
//      VIRTUAL / HIBRIDA para probar que **la modalidad da igual**; tres personas marcadas
//      PRESENT / ABSENT / JUSTIFIED; y lo que el Seguimiento dice de cada una.
//   B. ACOTAMIENTO. Las cinco facetas por separado y cruzadas, y **dos jornadas complementarias**
//      que reparten la misma poblacion sin pisarse: cada lista cierra lo suyo y el Seguimiento suma.
//   C. CORREGIR una lista ya tomada: re-marcar no puede exigir borrar nada a mano, y lo cumplido
//      no se reabre por cambiar una casilla.
import { crearCliente, paso, ok, mal, comprobar, resumen } from './api.mjs';
import { comprobarSeguimiento } from './seguimiento.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;
const creado = [];

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

const tipos = (await admin.get('/catalogs/activity-types')).cuerpo ?? [];
const procesos = (await admin.get('/catalogs/processes')).cuerpo ?? [];
const proceso = procesos.find((p) => p.active) ?? procesos[0];
const cargos = ((await admin.get('/catalogs/job-titles')).cuerpo ?? []).filter((c) => c.active);
const areas = ((await admin.get('/catalogs/areas')).cuerpo ?? []).filter((a) => a.active);
const regionales = ((await admin.get('/catalogs/regionals')).cuerpo ?? []).filter((r) => r.active);
const servicios = ((await admin.get('/catalogs/services')).cuerpo ?? []).filter((s) => s.active);

/*
  EL CARGO Y EL AREA MENOS POBLADOS, por lo mismo de siempre: exigir una formacion crea la
  obligacion a todo el que ya este dentro, y con "Conductor" serian cuatrocientas asignaciones de
  mentira que alguien tendria que limpiar despues.
*/
const poblacionCargo = new Map();
for (const c of cargos) {
  poblacionCargo.set(c.id, (await admin.post('/audiences/preview', { match: 'ALL', jobTitleIds: [c.id] })).cuerpo?.count ?? 0);
}
const cargo = [...cargos].sort((a, b) => poblacionCargo.get(a.id) - poblacionCargo.get(b.id))[0];
const area = areas[0];

/** Lo que el tipo PROMETE, leido de su configuracion. Ni una expectativa escrita a mano. */
function contratoDe(tipo) {
  const c = tipo.config ?? {};
  return {
    examen: c.requiresAssessment === true,
    encuesta: c.requiresSurvey === true,
    constancia: c.issuesCertificate === true,
    papelDeTercero: c.tracksExternalCertificate === true,
    entraAlPlan: c.participatesInPlan === true,
  };
}

/** Una persona nueva con ese cargo y esa area. */
let contadorPersonas = 0;
async function alta(etiqueta) {
  contadorPersonas += 1;
  const doc = `AM${marca}${contadorPersonas}`;
  const r = await admin.post('/users', {
    documentNumber: doc,
    fullName: `${etiqueta} ${contadorPersonas} ${SUFIJO}`,
    email: `${doc.toLowerCase()}@recorrido.test`,
    jobTitleId: cargo.id,
    areaId: area.id,
  });
  return { ok: r.ok, id: r.cuerpo?.id ?? r.cuerpo?.user?.id, doc, clave: r.cuerpo?.generatedPassword ?? r.cuerpo?.password };
}

/** Ficha + temario que el tipo pide + publicar. Devuelve null si algo se cae, ya reportado. */
async function montarFormacion(tipo, indice, modality) {
  const contrato = contratoDe(tipo);
  const ficha = await admin.post('/activities', {
    code: `AM${indice}_${SUFIJO}`,
    name: `Matriz ${tipo.name} ${SUFIJO}`,
    description: 'Formacion de la matriz de asistencia.',
    activityTypeId: tipo.id,
    processId: proceso.id,
    modality,
  });
  if (!ficha.ok) {
    mal(`${tipo.name}: no se pudo crear la ficha (${ficha.estado}) ${JSON.stringify(ficha.cuerpo).slice(0, 180)}`);
    return null;
  }
  const activityId = ficha.cuerpo.id;
  creado.push({ activityId, etiqueta: tipo.name });
  const versionId = ((await admin.get(`/activities/${activityId}`)).cuerpo?.versions ?? []).find((v) => v.status === 'DRAFT')?.id;

  const leccion = await admin.post('/lessons', { title: `LM ${indice} ${SUFIJO}`, estimatedMinutes: 5 });
  await admin.pedir(`/lessons/${leccion.cuerpo.id}/cards`, { method: 'PUT', body: JSON.stringify({
    cards: [{ payload: { cardType: 'TEXT_IMAGE', title: 'Tema', body: 'Contenido de la formacion.' } }],
  }) });
  await admin.post(`/activities/versions/${versionId}/contents`, {
    type: 'LESSON', title: 'Contenido', isRequired: true, config: { minSeconds: 1 }, lessonId: leccion.cuerpo.id,
  });

  if (contrato.examen) {
    const q = await admin.post('/questions', {
      payload: { qtype: 'SINGLE', stem: 'Pregunta', options: [{ id: 'a', text: 'Si' }, { id: 'b', text: 'No' }], correctOptionId: 'a', points: 1 },
    });
    const ex = await admin.post('/assessments', { title: `EM ${indice} ${SUFIJO}` });
    await admin.patch(`/assessments/${ex.cuerpo.id}`, {
      passingScore: 80, maxAttempts: 3, sections: [{ mode: 'FIXED', questionIds: [q.cuerpo.id] }],
    });
    await admin.post(`/activities/versions/${versionId}/contents`, {
      type: 'ASSESSMENT', title: 'Examen', isRequired: true, config: {}, assessmentId: ex.cuerpo.id,
    });
  }

  const publicada = await admin.post(`/activities/versions/${versionId}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
  if (!publicada.ok) {
    mal(`${tipo.name}: no se pudo publicar (${publicada.estado}) ${JSON.stringify(publicada.cuerpo).slice(0, 200)}`);
    return null;
  }
  return { activityId, versionId, contrato };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// PARTE A — UNA JORNADA POR CADA TIPO, Y LA MODALIDAD DA IGUAL
// ══════════════════════════════════════════════════════════════════════════════════════════════

/*
  LA MODALIDAD ROTA A PROPOSITO, Y LA VIRTUAL LLEVA LA CASILLA PUESTA.

  Como se cierra una jornada NO se deduce: se pregunta, con un defecto que acierta casi siempre
  —presencial e hibrida por lista, virtual por plataforma— y una casilla para lo que no encaja
  (`cierre-de-la-jornada.ts`). La regla derivada cambio dos veces en dos dias, las dos por un caso
  real, y por eso dejo de haber regla.

  Aqui se rota la modalidad para ejercer las tres, y en la VIRTUAL se marca `closesByAttendance` —
  que es exactamente el caso de la capacitacion que dicta la ARL por videollamada en vivo: es
  virtual y SI tiene lista de quien se conecto. Si eso dejara de funcionar, ese cliente se queda sin
  poder cerrar nada y nadie se entera hasta que lo reporta.
*/
const MODALIDADES = ['PRESENCIAL', 'VIRTUAL', 'HIBRIDA'];
const fecha = new Date().toISOString().slice(0, 10);
let n = 0;

for (const tipo of tipos) {
  n += 1;
  const modality = MODALIDADES[(n - 1) % MODALIDADES.length];
  paso(n, `${tipo.name.toUpperCase()} — jornada ${modality}, y los tres estados de la lista`);

  const montada = await montarFormacion(tipo, n, modality);
  if (!montada) continue;
  const { activityId, versionId, contrato } = montada;
  console.log(
    `   ... el tipo promete: examen=${contrato.examen} constancia=${contrato.constancia} ` +
      `papel de tercero=${contrato.papelDeTercero} plan=${contrato.entraAlPlan}`,
  );

  const jornada = await admin.post('/offerings', {
    activityVersionId: versionId,
    kind: 'EVENT',
    modality,
    // La virtual necesita decirlo: es el caso de la videollamada en vivo con lista.
    ...(modality === 'VIRTUAL' ? { closesByAttendance: true } : {}),
    scheduledDate: fecha,
    startTime: '08:00',
    endTime: '10:00',
    location: `Sala ${n} ${SUFIJO}`,
    executedBy: 'ARL',
    executedByOther: `ARL Matriz ${n}`,
    capacity: 20,
    intensityTheoryHours: 1,
    intensityPracticeHours: 1,
  });
  comprobar(jornada.ok, `jornada EVENT ${modality} programada`, `jornada: ${jornada.estado} ${JSON.stringify(jornada.cuerpo).slice(0, 200)}`);
  if (jornada.ok) {
    const detalleCierre = (await admin.get(`/offerings/${jornada.cuerpo.id}`)).cuerpo;
    comprobar(
      detalleCierre?.admiteAsistencia === true,
      `y admite lista siendo ${modality}${modality === 'VIRTUAL' ? ' porque se marco a mano' : ' por su modalidad'}`,
      `admiteAsistencia=${detalleCierre?.admiteAsistencia} con modalidad ${modality}`,
    );
  }
  if (!jornada.ok) continue;
  const offeringId = jornada.cuerpo.id;
  const pub = await admin.post(`/offerings/${offeringId}/publish`, { confirm: true });
  comprobar(pub.ok, 'y publicada', `publicar: ${pub.estado} ${JSON.stringify(pub.cuerpo).slice(0, 200)}`);
  if (!pub.ok) continue;

  const gente = [];
  for (const etiqueta of ['Presente', 'Ausente', 'Justificado']) {
    const p = await alta(etiqueta);
    if (p.ok) gente.push(p);
  }
  comprobar(gente.length === 3, 'tres personas creadas y convocadas', `solo se crearon ${gente.length}`);
  const convocar = await admin.post(`/offerings/${offeringId}/enroll`, { userIds: gente.map((p) => p.id) });
  comprobar(convocar.ok, `convocadas (${convocar.estado})`, `convocar: ${convocar.estado} ${JSON.stringify(convocar.cuerpo).slice(0, 200)}`);

  const lista = (await admin.get(`/offerings/${offeringId}/roster`)).cuerpo?.items ?? [];
  comprobar(lista.length === 3, 'la lista trae a las tres', `trae ${lista.length}`);
  if (lista.length !== 3) continue;
  const fila = (uid) => lista.find((f) => f.user.id === uid);

  const detalle = (await admin.get(`/offerings/${offeringId}`)).cuerpo;
  comprobar(
    detalle?.registraCertificadoExterno === contrato.papelDeTercero,
    `la jornada dice si lleva papel de tercero (${detalle?.registraCertificadoExterno}), y coincide con lo que promete el tipo`,
    `la jornada dice ${detalle?.registraCertificadoExterno} y el tipo dice ${contrato.papelDeTercero}`,
  );

  const marcar = await admin.post(`/offerings/${offeringId}/attendance`, {
    heldOn: fecha,
    items: [
      {
        enrollmentId: fila(gente[0].id).id,
        estado: 'PRESENT',
        // Solo el NUMERO: el emisor lo pone el servidor desde la jornada. Y solo cuando el tipo lo
        // lleva, porque si no el servidor lo rechaza — que es lo que se quiere.
        ...(contrato.papelDeTercero ? { certificate: { number: `MTZ-${marca}-${n}` } } : {}),
      },
      { enrollmentId: fila(gente[1].id).id, estado: 'ABSENT' },
      { enrollmentId: fila(gente[2].id).id, estado: 'JUSTIFIED', motivo: 'Incapacidad medica.' },
    ],
  });
  comprobar(marcar.ok, `asistencia marcada (${marcar.estado})`, `asistencia: ${marcar.estado} ${JSON.stringify(marcar.cuerpo).slice(0, 250)}`);
  comprobar(
    marcar.cuerpo?.cerradas === 1 && marcar.cuerpo?.ausentes === 2 && marcar.cuerpo?.justificados === 1,
    `cierra 1, deja 2 sin cerrar y 1 de ellas justificada`,
    `cerradas=${marcar.cuerpo?.cerradas} ausentes=${marcar.cuerpo?.ausentes} justificados=${marcar.cuerpo?.justificados}`,
  );

  const listaTras = (await admin.get(`/offerings/${offeringId}/roster`)).cuerpo?.items ?? [];
  const trasFila = (uid) => listaTras.find((f) => f.user.id === uid);
  comprobar(
    trasFila(gente[0].id)?.completedAt !== null && trasFila(gente[0].id)?.attendanceStatus === 'PRESENT',
    'quien asistio queda CERRADO sin haber tocado el contenido' + (contrato.examen ? ', y su tipo exige examen' : ''),
    `estado=${trasFila(gente[0].id)?.attendanceStatus} completedAt=${trasFila(gente[0].id)?.completedAt}`,
  );
  comprobar(
    trasFila(gente[1].id)?.completedAt === null && trasFila(gente[1].id)?.attendanceStatus === 'ABSENT',
    'quien no vino NO se cierra',
    `estado=${trasFila(gente[1].id)?.attendanceStatus} completedAt=${trasFila(gente[1].id)?.completedAt}`,
  );
  comprobar(
    trasFila(gente[2].id)?.completedAt === null && trasFila(gente[2].id)?.attendanceStatus === 'JUSTIFIED',
    'y la falta justificada TAMPOCO cierra: explica, no exime',
    `estado=${trasFila(gente[2].id)?.attendanceStatus} completedAt=${trasFila(gente[2].id)?.completedAt}`,
  );

  if (contrato.papelDeTercero) {
    comprobar(
      trasFila(gente[0].id)?.extCertIssuer === `ARL Matriz ${n}`,
      `el emisor lo puso la jornada: "${trasFila(gente[0].id)?.extCertIssuer}"`,
      `emisor=${trasFila(gente[0].id)?.extCertIssuer}, y la jornada la dicta "ARL Matriz ${n}"`,
    );
  } else {
    const rechazo = await admin.post(`/offerings/${offeringId}/attendance`, {
      items: [{ enrollmentId: fila(gente[1].id).id, estado: 'PRESENT', certificate: { number: 'X' } }],
    });
    comprobar(
      rechazo.estado === 409 && rechazo.cuerpo?.code === 'TYPE_DOES_NOT_TRACK_EXTERNAL_CERT',
      'y como su tipo NO lleva papel de tercero, mandarlo se rechaza con 409',
      `esperaba 409 TYPE_DOES_NOT_TRACK_EXTERNAL_CERT y vino ${rechazo.estado}`,
    );
  }

  /*
    LA CONSTANCIA LA DECIDE EL TIPO, Y NADA MAS (corregido el 2026-09-06).

    Aqui se esperaba que el papel de un TERCERO suprimiera la propia. Era una regla inventada y el
    cliente la cazo: *"que un externo genere certificacion no quiere decir que no deba generarse la
    interna"*. No son el mismo hecho —una dice "asistio el dia X" y la otra "esta habilitada hasta
    Y"— y si una empresa no quiere las dos ya tiene donde decirlo.
  */
  const debeHaberConstancia = contrato.constancia;
  const aprendiz = crearCliente();
  let entro = false;
  try { await aprendiz.entrar(gente[0].doc, gente[0].clave); entro = true; } catch { entro = false; }
  if (entro) {
    const suyos = (await aprendiz.get('/me/certificados')).cuerpo;
    const items = suyos?.items ?? suyos ?? [];
    const suya = items.find?.((c) => c.activityName?.includes(SUFIJO) && c.activityName?.includes(tipo.name)) ?? null;
    comprobar(
      debeHaberConstancia ? !!suya : !suya,
      debeHaberConstancia
        ? 'y se emite la constancia propia, que es lo que promete su tipo'
        : 'y NO se emite constancia, que es lo que dice su tipo',
      debeHaberConstancia
        ? `su tipo emite constancia y no aparece ninguna (${items.length ?? 0} en total)`
        : 'se emitio una constancia que no deberia existir',
    );
  }

  await comprobarSeguimiento(admin, activityId, { numeroDePaso: `${n}b` });
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// PARTE B — ACOTAMIENTO: LAS CINCO FACETAS, Y DOS JORNADAS QUE REPARTEN SIN PISARSE
// ══════════════════════════════════════════════════════════════════════════════════════════════

n += 1;
paso(n, 'ACOTAMIENTO: las cinco facetas medidas sobre gente que crea esta prueba');
/*
  ─── POR QUE SE CREA LA GENTE EN VEZ DE MEDIR LA QUE HAY ───

  La primera version preguntaba por cada faceta y comprobaba que "resolvia". Regional y servicio
  devolvian **0 personas** —el tenant de desarrollo no tiene a nadie con esos campos puestos— asi que
  la asercion pasaba sin comprobar nada: un comentario con sintaxis de codigo, que es justo lo que
  este directorio ya se prohibio una vez.

  Aqui se crean CUATRO personas con una combinacion elegida y se mide el DELTA de cada faceta. El
  delta es robusto contra lo que ya hubiera en la base, y convierte "resuelve" en un numero exacto:

      persona 1   regional R   servicio S
      persona 2   regional R   —
      persona 3   —            servicio S
      persona 4   —            —

  Las cuatro comparten cargo y area, asi que esas dos facetas suben 4. Regional sube 2, servicio
  sube 2, y **regional x servicio sube 1**: esa ultima es la prueba de que las facetas se CRUZAN y
  no se suman, medida sobre datos que controla la prueba.
*/
const regional = regionales[0] ?? null;
const servicio = servicios[0] ?? null;
comprobar(!!regional && !!servicio, 'hay regional y servicio en el catalogo para poder medir', 'faltan regionales o servicios activos en el tenant');

const alcance = async (criterios) => (await admin.post('/audiences/preview', { match: 'ALL', ...criterios })).cuerpo?.count ?? 0;
const antes = {
  cargo: await alcance({ jobTitleIds: [cargo.id] }),
  area: await alcance({ areaIds: [area.id] }),
  regional: regional ? await alcance({ regionalIds: [regional.id] }) : 0,
  servicio: servicio ? await alcance({ serviceIds: [servicio.id] }) : 0,
  cargoYRegional: regional ? await alcance({ jobTitleIds: [cargo.id], regionalIds: [regional.id] }) : 0,
  regionalYServicio: regional && servicio ? await alcance({ regionalIds: [regional.id], serviceIds: [servicio.id] }) : 0,
};

/*
  EL REQUISITO VA ANTES QUE LA GENTE, y con "solo a quien entre desde ahora".

  Si se creara despues, exigir la formacion al cargo le crearia la obligacion a las 129 personas que
  ya lo tienen — 129 asignaciones de mentira que alguien tendria que limpiar. Y sin requisito, las
  personas no tendrian obligacion ninguna y el Seguimiento de esta parte saldria con CERO filas:
  otra asercion que pasa sin comprobar nada.
*/
const tipoParte = tipos.find((t) => t.config?.requiresAssessment !== true) ?? tipos[0];
const partida = await montarFormacion(tipoParte, 900, 'PRESENCIAL');
if (!partida) {
  mal('no se pudo montar la formacion de la parte B; se salta el resto');
} else {
  const requisito = await admin.post(`/activities/${partida.activityId}/requirements`, {
    scope: { match: 'ALL', jobTitleIds: [cargo.id] },
    trigger: 'ON_JOIN',
    dueDaysAfterTrigger: 30,
    soloNuevos: true,
  });
  comprobar(requisito.ok, `exigida al cargo "${cargo.name}", solo a quien entre desde ahora`, `requisito: ${requisito.estado} ${JSON.stringify(requisito.cuerpo).slice(0, 220)}`);

  const combinaciones = [
    { regionalId: regional?.id ?? null, serviceId: servicio?.id ?? null },
    { regionalId: regional?.id ?? null, serviceId: null },
    { regionalId: null, serviceId: servicio?.id ?? null },
    { regionalId: null, serviceId: null },
  ];
  const cuatro = [];
  for (const extra of combinaciones) {
    contadorPersonas += 1;
    const doc = `AM${marca}${contadorPersonas}`;
    const r = await admin.post('/users', {
      documentNumber: doc,
      fullName: `Acotada ${contadorPersonas} ${SUFIJO}`,
      email: `${doc.toLowerCase()}@recorrido.test`,
      jobTitleId: cargo.id,
      areaId: area.id,
      ...(extra.regionalId ? { regionalId: extra.regionalId } : {}),
      ...(extra.serviceId ? { serviceId: extra.serviceId } : {}),
    });
    if (r.ok) cuatro.push({ id: r.cuerpo?.id ?? r.cuerpo?.user?.id, doc, ...extra });
    else mal(`no se pudo crear la persona ${contadorPersonas}: ${r.estado} ${JSON.stringify(r.cuerpo).slice(0, 180)}`);
  }
  comprobar(cuatro.length === 4, 'cuatro personas creadas con las cuatro combinaciones', `se crearon ${cuatro.length}`);

  const despues = {
    cargo: await alcance({ jobTitleIds: [cargo.id] }),
    area: await alcance({ areaIds: [area.id] }),
    regional: regional ? await alcance({ regionalIds: [regional.id] }) : 0,
    servicio: servicio ? await alcance({ serviceIds: [servicio.id] }) : 0,
    cargoYRegional: regional ? await alcance({ jobTitleIds: [cargo.id], regionalIds: [regional.id] }) : 0,
    regionalYServicio: regional && servicio ? await alcance({ regionalIds: [regional.id], serviceIds: [servicio.id] }) : 0,
  };
  const delta = Object.fromEntries(Object.keys(antes).map((k) => [k, despues[k] - antes[k]]));
  console.log(
    `   ... delta: cargo +${delta.cargo} · area +${delta.area} · regional +${delta.regional} · ` +
      `servicio +${delta.servicio} · cargo x regional +${delta.cargoYRegional} · regional x servicio +${delta.regionalYServicio}`,
  );

  comprobar(delta.cargo === 4 && delta.area === 4, 'las cuatro entran por cargo y por area', `cargo +${delta.cargo} area +${delta.area}, y deberian ser +4`);
  comprobar(delta.regional === 2, 'solo DOS tienen regional', `regional +${delta.regional} y deberian ser +2`);
  comprobar(delta.servicio === 2, 'y solo DOS tienen servicio', `servicio +${delta.servicio} y deberian ser +2`);
  comprobar(delta.cargoYRegional === 2, 'cargo x regional alcanza a las dos que tienen regional', `+${delta.cargoYRegional} y deberian ser +2`);
  comprobar(
    delta.regionalYServicio === 1,
    'y regional x servicio alcanza a UNA: las facetas se CRUZAN, no se suman (2 y 2 dan 1, no 4)',
    `regional x servicio +${delta.regionalYServicio} y deberia ser +1`,
  );

  const suyas = async (uid) => ((await admin.get(`/assignments?targetId=${partida.activityId}&userId=${uid}&pageSize=50`)).cuerpo?.items ?? []);
  comprobar((await suyas(cuatro[0].id)).length === 1, 'y a cada una le nace su obligacion al entrar', 'no le nacio la obligacion');

  n += 1;
  paso(n, 'DOS JORNADAS COMPLEMENTARIAS: cada lista cierra LO SUYO, y el Seguimiento suma');
  /*
    Es el caso real de una formacion que no cabe en una sola sesion: se parte en dos jornadas, cada
    una con su gente. Lo que hay que demostrar es que **ninguna lista toca a la gente de la otra** —
    si una alcanzara fuera de su jornada, cerrar la primera daria por cumplida a gente que todavia
    no ha ido.
  */
  const grupoA = cuatro.slice(0, 2);
  const grupoB = cuatro.slice(2);
  const jornadas = [];
  for (const [i, grupo] of [grupoA, grupoB].entries()) {
    const j = await admin.post('/offerings', {
      activityVersionId: partida.versionId, kind: 'EVENT', modality: 'PRESENCIAL',
      scheduledDate: fecha, startTime: i === 0 ? '08:00' : '14:00', endTime: i === 0 ? '10:00' : '16:00',
      location: `Tanda ${i + 1} ${SUFIJO}`, capacity: 10,
    });
    comprobar(j.ok, `jornada ${i + 1} programada`, `jornada ${i + 1}: ${j.estado} ${JSON.stringify(j.cuerpo).slice(0, 200)}`);
    await admin.post(`/offerings/${j.cuerpo?.id}/publish`, { confirm: true });
    await admin.post(`/offerings/${j.cuerpo?.id}/enroll`, { userIds: grupo.map((p) => p.id) });
    const lista = (await admin.get(`/offerings/${j.cuerpo?.id}/roster`)).cuerpo?.items ?? [];
    jornadas.push({ id: j.cuerpo?.id, lista });
    comprobar(lista.length === 2, `la jornada ${i + 1} trae a sus dos`, `la jornada ${i + 1} trae ${lista.length}`);
  }

  const cierreA = await admin.post(`/offerings/${jornadas[0].id}/attendance`, {
    heldOn: fecha,
    items: jornadas[0].lista.map((f) => ({ enrollmentId: f.id, estado: 'PRESENT' })),
  });
  comprobar(cierreA.ok && cierreA.cuerpo?.cerradas === 2, 'la primera jornada cierra sus DOS', `cerradas=${cierreA.cuerpo?.cerradas}`);

  const listaB = (await admin.get(`/offerings/${jornadas[1].id}/roster`)).cuerpo?.items ?? [];
  comprobar(
    listaB.every((f) => f.completedAt === null && f.attendanceStatus === null),
    'y la SEGUNDA sigue intacta: sin revisar, que no es lo mismo que ausente',
    `la segunda jornada quedo tocada: ${listaB.map((f) => `${f.attendanceStatus}/${f.completedAt}`).join(', ')}`,
  );

  const cierreB = await admin.post(`/offerings/${jornadas[1].id}/attendance`, {
    heldOn: fecha,
    items: [
      { enrollmentId: listaB[0].id, estado: 'PRESENT' },
      { enrollmentId: listaB[1].id, estado: 'ABSENT' },
    ],
  });
  comprobar(cierreB.ok && cierreB.cuerpo?.cerradas === 1, 'la segunda cierra una y deja la otra', `cerradas=${cierreB.cuerpo?.cerradas}`);

  /*
    Y AQUI ESTA LO QUE DE VERDAD SE QUERIA MEDIR: que las dos listas SUMAN en el informe. Tres
    asistieron y una no, asi que el avance tiene que ser 3 de 4.
  */
  const informe = (await admin.get(`/reportes/actividades/${partida.activityId}/ejecucion`)).cuerpo;
  console.log(
    `   ... el informe dice: total=${informe?.resumen?.total} terminadas=${informe?.resumen?.terminadas} ` +
      `avance=${informe?.resumen?.avancePct}%`,
  );
  comprobar(
    informe?.resumen?.total === 4 && informe?.resumen?.terminadas === 3,
    'el Seguimiento SUMA las dos jornadas: 4 obligaciones, 3 terminadas',
    `total=${informe?.resumen?.total} terminadas=${informe?.resumen?.terminadas}, y deberian ser 4 y 3`,
  );
  comprobar(
    informe?.resumen?.avancePct === 75,
    'y el avance es 3 de 4 = 75%',
    `avance=${informe?.resumen?.avancePct}% y deberia ser 75%`,
  );

  await comprobarSeguimiento(admin, partida.activityId, { numeroDePaso: `${n}b` });
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// PARTE C — RE-MARCAR: CORREGIR UNA LISTA NO PUEDE EXIGIR BORRAR NADA A MANO
// ══════════════════════════════════════════════════════════════════════════════════════════════

n += 1;
paso(n, 'CORREGIR LA LISTA: se re-marca sin borrar nada, y lo cerrado no se reabre');
if (partida) {
  const j = await admin.post('/offerings', {
    activityVersionId: partida.versionId, kind: 'EVENT', modality: 'PRESENCIAL',
    scheduledDate: fecha, startTime: '17:00', endTime: '18:00', location: `Correccion ${SUFIJO}`, capacity: 5,
  });
  await admin.post(`/offerings/${j.cuerpo?.id}/publish`, { confirm: true });
  const p = await alta('Correccion');
  await admin.post(`/offerings/${j.cuerpo?.id}/enroll`, { userIds: [p.id] });
  const lista = (await admin.get(`/offerings/${j.cuerpo?.id}/roster`)).cuerpo?.items ?? [];

  // Primero se marca mal: ausente.
  await admin.post(`/offerings/${j.cuerpo?.id}/attendance`, {
    heldOn: fecha, items: [{ enrollmentId: lista[0].id, estado: 'ABSENT' }],
  });
  const trasError = ((await admin.get(`/offerings/${j.cuerpo?.id}/roster`)).cuerpo?.items ?? [])[0];
  comprobar(trasError?.attendanceStatus === 'ABSENT', 'se marca por error como ausente', `estado=${trasError?.attendanceStatus}`);

  // Y se corrige.
  const correccion = await admin.post(`/offerings/${j.cuerpo?.id}/attendance`, {
    heldOn: fecha, items: [{ enrollmentId: lista[0].id, estado: 'PRESENT' }],
  });
  comprobar(correccion.ok && correccion.cuerpo?.cerradas === 1, 'se corrige a presente y ahora si cierra', `${correccion.estado} cerradas=${correccion.cuerpo?.cerradas}`);
  const trasCorregir = ((await admin.get(`/offerings/${j.cuerpo?.id}/roster`)).cuerpo?.items ?? [])[0];
  comprobar(
    trasCorregir?.attendanceStatus === 'PRESENT' && trasCorregir?.completedAt !== null,
    'la fila se pisa, no se duplica: una asistencia por persona y jornada',
    `estado=${trasCorregir?.attendanceStatus} completedAt=${trasCorregir?.completedAt}`,
  );

  // Y volver a marcarla ausente NO reabre lo ya cerrado: la evidencia de haber cursado no se borra
  // por cambiar una casilla.
  const reintento = await admin.post(`/offerings/${j.cuerpo?.id}/attendance`, {
    heldOn: fecha, items: [{ enrollmentId: lista[0].id, estado: 'ABSENT' }],
  });
  const trasDeshacer = ((await admin.get(`/offerings/${j.cuerpo?.id}/roster`)).cuerpo?.items ?? [])[0];
  comprobar(
    reintento.ok && trasDeshacer?.completedAt !== null,
    'y marcarla ausente despues NO reabre lo cumplido: la ejecucion ya ocurrio y no se borra por una casilla',
    `completedAt=${trasDeshacer?.completedAt} tras volver a marcarla ausente`,
  );
}

console.log(`\nCREADO PARA LIMPIAR: ${creado.length} formaciones · sufijo=${SUFIJO}`);
process.exit(resumen() === 0 ? 0 : 1);
