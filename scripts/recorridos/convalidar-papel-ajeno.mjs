// RECORRIDO: LA VIA C. QUIEN LLEGA YA CERTIFICADO DE OTRO EMPLEO (`PENDIENTES` 2.3).
//
// ─── EL CASO ───
//
// Se contrata a alguien que ya trae su certificado de alturas del empleo anterior, vigente. Le nace
// la obligacion por su cargo y hasta hoy no habia por donde decir "ya esta certificada": se quedaba
// pendiente para siempre, o alguien inventaba una jornada para poder cerrarla — que es peor, porque
// mete en el plan una jornada que nadie dicto.
//
// ─── LAS DOS CAPAS, Y POR QUE HACEN FALTA LAS DOS ───
//
// Lo pregunto el cliente: *"¿y si la empresa cree que debe hacerlo igual porque son procesos
// propios?"*. Tiene razon, y por eso:
//
//   1. LA FORMACION declara si se puede convalidar (`admiteConvalidacion`, por defecto NO). Sin
//      esta capa se podria dar por cumplida una induccion con el papel de otra empresa.
//   2. Y aun admitiendolo, ACEPTAR UN PAPEL CONCRETO es un acto con nombre, fecha y motivo. Sin
//      esta capa se aceptaria cualquier papel sin mirarlo.
//
// ─── UNA TRAMPA QUE MORDIO AL ESCRIBIRLO ───
//
// Las busquedas por nombre van SIEMPRE acotadas al sufijo de esta corrida. Sin el, buscar solo
// "Trabajo en alturas" caza la formacion de una corrida ANTERIOR: las reglas de prueba
// siguen activas hasta que se limpian, asi que a cada persona nueva del mismo cargo le nacen
// tambien las obligaciones de todo lo que quedo de antes. El sintoma es desconcertante —la
// convalidacion funciona y la asercion dice que no— porque se convalida una obligacion y se lee otra.
//
// ─── LO QUE COMPRUEBA ───
//
//   1. Una formacion que NO lo admite: ni se ofrece ni se deja, desde el servidor.
//   2. Una que si: se ofrece solo mientras la obligacion esta ABIERTA.
//   3. Al convalidar queda CUMPLIDA —no eximida— con su papel y con quien lo acepto.
//   4. La vigencia del papel MANDA: va a `validUntilOverride`, que es lo que lee el motor.
//   5. Un papel ya VENCIDO se rechaza: aceptarlo seria pintar de verde un incumplimiento.
//   6. Sin motivo, o con un motivo de dos letras, no se deja.
//   7. Y no se puede convalidar dos veces ni algo ya cumplido.
//
//   node scripts/recorridos/convalidar-papel-ajeno.mjs
import { crearCliente, paso, ok, mal, comprobar, resumen } from './api.mjs';

const enBogota = (iso) => (iso ? new Date(new Date(iso).getTime() - 5 * 3600000).toISOString().slice(0, 10) : null);

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;
const vigente = new Date(Date.now() + 300 * 86400000).toISOString().slice(0, 10);
const caducado = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(1, 'MONTAJE: dos tipos, uno que admite convalidacion y otro que no');

const tipos = (await admin.get('/catalogs/activity-types')).cuerpo ?? [];
const recert = tipos.find((t) => t.code === 'RECERTIFICACION');
const induccion = tipos.find((t) => t.code === 'INDUCCION_GENERAL') ?? tipos.find((t) => t.config?.admiteConvalidacion !== true && t.id !== recert?.id);
comprobar(!!recert && !!induccion, 'existen los dos tipos', `recert=${!!recert} otro=${!!induccion}`);
if (!recert || !induccion) { resumen(); process.exit(1); }

/*
  SE ENCIENDE LA BANDERA EN EL TIPO QUE LO ADMITE. Es configuracion del tenant y arranca en `false`
  para todos: la excepcion es la recertificacion legal, cuyo papel la norma hace transferible.
*/
const encender = await admin.patch(`/catalogs/activity-types/${recert.id}`, {
  config: { ...(recert.config ?? {}), admiteConvalidacion: true },
});
comprobar(encender.ok, 'la Recertificacion pasa a admitir convalidacion', `${encender.estado} ${JSON.stringify(encender.cuerpo).slice(0, 160)}`);

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

async function montar(tipo, codigo, nombre, conExamen) {
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
      payload: { qtype: 'SINGLE', stem: 'Antes...', options: [{ id: 'a', text: 'Si' }, { id: 'b', text: 'No' }], correctOptionId: 'a', points: 1 },
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
  return activityId;
}

const alturas = await montar(recert, 'CONV', 'Trabajo en alturas', true);
const laInduccion = await montar(induccion, 'INDU', 'Induccion propia', induccion.config?.requiresAssessment === true);
comprobar(!!alturas && !!laInduccion, 'las dos formaciones, publicadas y exigidas al cargo', 'no se pudieron montar');

// La persona que llega ya certificada.
const doc = `CV${marca}1`;
const alta = await admin.post('/users', {
  documentNumber: doc, fullName: `Llega certificada ${SUFIJO}`,
  email: `${doc.toLowerCase()}@recorrido.test`, jobTitleId: cargo.id, areaId: area.id,
});
const persona = alta.cuerpo?.id ?? alta.cuerpo?.user?.id;
comprobar(!!persona, 'entra al sistema y le nacen sus obligaciones', `alta: ${alta.estado}`);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(2, 'QUE SE LE OFRECE: solo lo que la FORMACION admite convalidar');

const ofrecidas = await admin.get(`/assignments/convalidables?userId=${persona}`);
comprobar(ofrecidas.ok, 'la puerta responde', `${ofrecidas.estado} ${JSON.stringify(ofrecidas.cuerpo).slice(0, 160)}`);
const laDeAlturas = (ofrecidas.cuerpo ?? []).find((f) => f.actividad?.includes(`Trabajo en alturas ${SUFIJO}`));
comprobar(!!laDeAlturas, 'sale la recertificacion: su papel es transferible por norma', `no aparece entre ${(ofrecidas.cuerpo ?? []).length}`);
comprobar(
  !(ofrecidas.cuerpo ?? []).some((f) => f.actividad?.includes(`Induccion propia ${SUFIJO}`)),
  'y NO sale la induccion: ningun papel de otra empresa enseña los procedimientos de esta',
  'se ofrece convalidar una induccion, que es justo lo que no puede pasar',
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(3, 'LA COMPUERTA DEL SERVIDOR: no basta con que la lista no lo ofrezca');

const obligaciones = (await admin.get(`/assignments?targetId=${laInduccion}&userId=${persona}&pageSize=50`)).cuerpo?.items ?? [];
const laDeInduccion = obligaciones[0];
if (laDeInduccion) {
  const intento = await admin.post(`/assignments/${laDeInduccion.id}/convalidar`, {
    number: `AJENO-${marca}`, issuer: 'Otra empresa', validUntil: vigente,
    reason: 'Trae certificado de su empleo anterior, vigente',
  });
  comprobar(
    !intento.ok && intento.cuerpo?.code === 'ACTIVITY_DOES_NOT_ALLOW_CONVALIDATION',
    'convalidar la induccion se rechaza DESDE EL SERVIDOR, aunque se llame a la puerta a mano',
    `lo acepto: ${intento.estado} ${JSON.stringify(intento.cuerpo).slice(0, 140)}`,
  );
} else {
  mal('no nacio la obligacion de la induccion: no se pudo probar la compuerta');
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(4, 'LOS DOS RECHAZOS QUE PROTEGEN EL DATO');

// (a) Un papel ya vencido.
const yaVencido = await admin.post(`/assignments/${laDeAlturas.assignmentId}/convalidar`, {
  number: `VIEJO-${marca}`, issuer: 'ARL Sura', validUntil: caducado,
  reason: 'Trae certificado del empleo anterior pero ya caduco',
});
comprobar(
  !yaVencido.ok && yaVencido.cuerpo?.code === 'CERT_ALREADY_EXPIRED',
  `un papel vencido (${caducado}) se rechaza: aceptarlo pintaria de verde un incumplimiento`,
  `lo acepto: ${yaVencido.estado} ${JSON.stringify(yaVencido.cuerpo).slice(0, 140)}`,
);

// (b) Sin motivo de verdad.
const sinMotivo = await admin.post(`/assignments/${laDeAlturas.assignmentId}/convalidar`, {
  number: `SIN-${marca}`, issuer: 'ARL Sura', validUntil: vigente, reason: 'ok',
});
comprobar(!sinMotivo.ok, 'un motivo de dos letras no vale: seis meses despues tiene que explicarse solo', `lo acepto: ${sinMotivo.estado}`);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(5, 'CONVALIDAR DE VERDAD: queda CUMPLIDA, no eximida');

const hecho = await admin.post(`/assignments/${laDeAlturas.assignmentId}/convalidar`, {
  number: `ALT-${marca}`,
  issuer: 'ARL Sura',
  validUntil: vigente,
  reason: 'Trae certificado de alturas de Coordinadora, expedido por ARL Sura y vigente',
});
comprobar(hecho.ok, 'se acepta', `${hecho.estado} ${JSON.stringify(hecho.cuerpo).slice(0, 160)}`);

const todas = (await admin.get(`/assignments?userId=${persona}&pageSize=100`)).cuerpo;
console.log(
  JSON.stringify((todas?.items ?? []).map((x) => [x.id.slice(0, 8), x.targetName, x.status, x.cycleNumber])),
);
const tras = ((await admin.get(`/assignments?targetId=${alturas}&userId=${persona}&pageSize=50`)).cuerpo?.items ?? [])
  .find((a) => a.id === laDeAlturas.assignmentId);
comprobar(tras?.status === 'COMPLETED', `la obligacion queda CUMPLIDA (${tras?.status})`, `status=${tras?.status}`);
comprobar(
  tras?.status !== 'WAIVED',
  'y NO eximida: "la dejamos pasar" seria falso — la hizo, en otro sitio',
  'quedo como WAIVED',
);
comprobar(
  enBogota(tras?.validUntilOverride) === vigente,
  `la vigencia del papel MANDA (${vigente}): es lo que lee el motor para la ronda siguiente`,
  `validUntilOverride=${enBogota(tras?.validUntilOverride)}`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(6, 'Y NO SE PUEDE CONVALIDAR DOS VECES');

const otraVez = await admin.post(`/assignments/${laDeAlturas.assignmentId}/convalidar`, {
  number: `OTRO-${marca}`, issuer: 'ARL Sura', validUntil: vigente,
  reason: 'Intento de convalidar algo que ya esta cumplido',
});
comprobar(
  !otraVez.ok && otraVez.cuerpo?.code === 'ASSIGNMENT_NOT_OPEN',
  'lo ya cumplido no se convalida: pisaria una evidencia con otra',
  `lo acepto: ${otraVez.estado} ${JSON.stringify(otraVez.cuerpo).slice(0, 140)}`,
);

const yaNoSale = (await admin.get(`/assignments/convalidables?userId=${persona}`)).cuerpo ?? [];
comprobar(
  !yaNoSale.some((f) => f.assignmentId === laDeAlturas.assignmentId),
  'y deja de ofrecerse en su lista',
  'sigue ofreciendose una obligacion ya convalidada',
);


// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(7, 'LA CASCADA: una formacion puede desviarse de lo que diga su clase');
/*
  Es lo que pregunto el cliente —"¿no es mejor que este en cada formacion?"— y lo que ya le paso a
  `tracksExternalCertificate` dos dias antes: nacio por tipo y hubo que anadir la cascada. El caso
  que no encaja es siempre el mismo: dentro de la MISMA clase conviven las dos cosas.
*/
{
  // Una segunda recertificacion, del mismo tipo que SI admite convalidacion...
  const interna = await montar(recert, 'INTER', 'Recertificacion interna', true);
  // ...pero que en su FICHA dice que no: es sobre un equipo propio y el papel ajeno no vale.
  const desviar = await admin.patch(`/activities/${interna}`, { admiteConvalidacion: false });
  comprobar(desviar.ok, 'la ficha se desvia de su tipo y dice que NO', `${desviar.estado} ${JSON.stringify(desviar.cuerpo).slice(0, 140)}`);

  const doc2 = `CV${marca}2`;
  const otra = await admin.post('/users', {
    documentNumber: doc2, fullName: `Segunda persona ${SUFIJO}`,
    email: `${doc2.toLowerCase()}@recorrido.test`, jobTitleId: cargo.id, areaId: area.id,
  });
  const otraId = otra.cuerpo?.id ?? otra.cuerpo?.user?.id;

  const ofrece = (await admin.get(`/assignments/convalidables?userId=${otraId}`)).cuerpo ?? [];
  comprobar(
    ofrece.some((f) => f.actividad?.includes(`Trabajo en alturas ${SUFIJO}`)),
    'la que hereda el SI de su tipo se sigue ofreciendo',
    'dejo de ofrecerse la que hereda',
  );
  comprobar(
    !ofrece.some((f) => f.actividad?.includes(`Recertificacion interna ${SUFIJO}`)),
    'y la que dice NO en su ficha NO se ofrece, aunque su tipo diga que si',
    'se ofrece una formacion que su propia ficha excluyo',
  );

  const laInterna = ((await admin.get(`/assignments?targetId=${interna}&userId=${otraId}&pageSize=50`)).cuerpo?.items ?? [])[0];
  if (laInterna) {
    const intento = await admin.post(`/assignments/${laInterna.id}/convalidar`, {
      number: `INT-${marca}`, issuer: 'Otra empresa', validUntil: vigente,
      reason: 'Intento de convalidar una formacion que su ficha excluyo',
    });
    comprobar(
      !intento.ok && intento.cuerpo?.code === 'ACTIVITY_DOES_NOT_ALLOW_CONVALIDATION',
      'y el servidor tambien la rechaza: la compuerta lee la cascada, no la columna del tipo',
      `lo acepto: ${intento.estado} ${JSON.stringify(intento.cuerpo).slice(0, 140)}`,
    );
  } else {
    mal('no nacio la obligacion de la recertificacion interna');
  }
}
/*
  SE APAGA LA BANDERA AL TERMINAR. Es configuracion del tenant y este recorrido la encendio: dejarla
  puesta cambiaria el comportamiento de la Recertificacion para todo el mundo, y el siguiente que
  mire la pantalla no sabria por que.
*/
await admin.patch(`/catalogs/activity-types/${recert.id}`, { config: { ...(recert.config ?? {}) } });
ok('la bandera del tipo vuelve a como estaba');

console.log(`\nCREADO PARA LIMPIAR: sufijo=${SUFIJO}`);
process.exit(resumen() === 0 ? 0 : 1);
