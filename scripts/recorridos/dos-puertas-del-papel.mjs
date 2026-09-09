// RECORRIDO: LAS DOS PUERTAS DEL PAPEL DE UN TERCERO DICEN LO MISMO (`PENDIENTES` 2.5).
//
// ─── QUE CIERRA ───
//
// El papel de un tercero se registra por dos sitios: la LISTA DE ASISTENCIA de la jornada y la ficha
// de la PERSONA (*Papeles de un tercero*). Cada una decidia por su cuenta si pedirlo, y el criterio
// «si la dicta la empresa, no hay tercero que certifique» vivia solo en la primera. El resultado lo
// vio el cliente: una fila que decia *"la dicto PROPIOS"* al lado de un campo para el numero del
// certificado externo — contradiciendose a si misma en la misma linea.
//
// Desde el 2026-09-08 el criterio vive en `certificate-policy.ts` y las dos puertas lo IMPORTAN. Un
// criterio copiado se separa; uno importado, no. Esto lo comprueba con la matriz entera.
//
// ─── LA MATRIZ ───
//
//   quien dicto la jornada  x  de donde sale que lleve papel  x  hay papel guardado o no
//   ─────────────────────────  ──────────────────────────────  ─────────────────────────
//   PROPIOS | un tercero       del TIPO | de la FICHA          si | no
//
// ─── LO QUE COMPRUEBA ───
//
//   1. Las dos puertas coinciden en las cuatro combinaciones de jornada x formacion.
//   2. `origen` dice de donde sale la fila (TIPO o FICHA), que es lo que faltaba para poder
//      comprobar por que una induccion aparecia pidiendo papel.
//   3. La cascada sigue mandando: una ficha que dice NO se impone al tipo que dice SI.
//   4. NO ES UNA COMPUERTA: con `PROPIOS` la pantalla no lo pide, pero el servidor lo acepta — hay
//      tenants (un centro de entrenamiento acreditado) donde propios y certificado oficial conviven.
//   5. Y con el papel ya guardado la fila lo enseña igual, se dictara quien se dictara: esconder un
//      dato registrado seria peor que no haberlo pedido.
//   6. Se puede ABRIR la formacion y la convocatoria desde la fila (el cliente lo pidio expreso).
//   7. Y todo eso llega hasta el final: la vigencia entra en la obligacion y sale en Vencimientos
//      una sola vez, del lado de REPROGRAMAR.
//
//   node scripts/recorridos/dos-puertas-del-papel.mjs
import { crearCliente, paso, ok, comprobar, resumen } from './api.mjs';

const enBogota = (iso) => (iso ? new Date(new Date(iso).getTime() - 5 * 3600000).toISOString().slice(0, 10) : null);

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;
const hoy = new Date().toISOString().slice(0, 10);
const vence = new Date(Date.now() + 200 * 86400000).toISOString().slice(0, 10);

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(1, 'MONTAJE: dos formaciones que llevan papel por caminos distintos, y una que lo rechaza');

/*
  LOS TIPOS SE ELIGEN POR SU CONFIGURACION, NO POR SU CODIGO.

  `activity_types.config` es configuracion del TENANT y cambia: el 2026-09-08 RECERTIFICACION tenia
  el papel apagado y INDUCCION_ESPECIFICA encendido, justo al reves de la semilla. Un recorrido que
  nombre codigos comprueba la configuracion de hoy en vez de la regla, y falla por un motivo que no
  tiene nada que ver con lo que prueba.

  Se descarta MICROLEARNING a proposito: una pildora no se dicta en jornada presencial.
*/
const tipos = (await admin.get('/catalogs/activity-types')).cuerpo ?? [];
const utilizables = tipos.filter((t) => t.code !== 'MICROLEARNING' && t.active !== false);
const tipoConPapel = utilizables.find((t) => t.config?.tracksExternalCertificate === true);
const tipoSinPapel = utilizables.find((t) => t.config?.tracksExternalCertificate !== true);
comprobar(!!tipoConPapel && !!tipoSinPapel, 'existen un tipo que lleva papel y otro que no', `conPapel=${!!tipoConPapel} sinPapel=${!!tipoSinPapel}`);
if (!tipoConPapel || !tipoSinPapel) { resumen(); process.exit(1); }

const procesos = (await admin.get('/catalogs/processes')).cuerpo ?? [];
const proceso = procesos.find((p) => p.active) ?? procesos[0];
const cargos = ((await admin.get('/catalogs/job-titles')).cuerpo ?? []).filter((c) => c.active);
const areas = ((await admin.get('/catalogs/areas')).cuerpo ?? []).filter((a) => a.active);
const poblacion = new Map();
for (const c of cargos) {
  poblacion.set(c.id, (await admin.post('/audiences/preview', { match: 'ALL', jobTitleIds: [c.id] })).cuerpo?.count ?? 0);
}
// El cargo menos poblado: montar sobre uno grande haria nacer obligaciones a media empresa.
const cargo = [...cargos].sort((a, b) => poblacion.get(a.id) - poblacion.get(b.id))[0];
const area = areas[0];

async function montar({ tipo, codigo, nombre, papelEnLaFicha, conRecurrencia = true }) {
  const ficha = await admin.post('/activities', {
    code: `${codigo}_${SUFIJO}`,
    name: `${nombre} ${SUFIJO}`,
    activityTypeId: tipo.id,
    processId: proceso.id,
    modality: 'PRESENCIAL',
    ...(papelEnLaFicha === undefined ? {} : { tracksExternalCertificate: papelEnLaFicha }),
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
  // El examen si su TIPO lo exige: sin el, publicar se rechaza y todo lo de abajo falla por un
  // motivo que no se parece a la causa (`type-requirements.ts`).
  if (tipo.config?.requiresAssessment !== false) {
    const preg = await admin.post('/questions', {
      payload: { qtype: 'SINGLE', stem: 'Antes de operar...', options: [{ id: 'a', text: 'Se revisa' }, { id: 'b', text: 'Se arranca' }], correctOptionId: 'a', points: 1 },
    });
    const ex = await admin.post('/assessments', { title: `Examen ${nombre} ${SUFIJO}` });
    await admin.patch(`/assessments/${ex.cuerpo.id}`, {
      passingScore: 80, maxAttempts: 3, sections: [{ mode: 'FIXED', questionIds: [preg.cuerpo?.id] }],
    });
    await admin.post(`/activities/versions/${versionId}/contents`, {
      type: 'ASSESSMENT', title: 'Examen', isRequired: true, config: {}, assessmentId: ex.cuerpo.id,
    });
  }
  const publicada = await admin.post(`/activities/versions/${versionId}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
  comprobar(publicada.ok, `publicada: ${nombre}`, `${publicada.estado} ${JSON.stringify(publicada.cuerpo).slice(0, 200)}`);
  await admin.post(`/activities/${activityId}/requirements`, {
    scope: { match: 'ALL', jobTitleIds: [cargo.id] },
    trigger: 'ON_JOIN', dueDaysAfterTrigger: 30, ...(conRecurrencia ? { everyMonths: 12 } : {}), soloNuevos: true,
  });
  return { activityId, versionId };
}

// (a) HEREDADA: la ficha no dice nada y manda su tipo. Es el caso mayoritario.
const heredada = await montar({ tipo: tipoConPapel, codigo: 'HER', nombre: 'Papel heredado del tipo' });
// (b) PROPIA: la ficha lo enciende sobre un tipo que no lo lleva.
const propia = await montar({ tipo: tipoSinPapel, codigo: 'PRO', nombre: 'Papel puesto en la ficha', papelEnLaFicha: true });
// (c) APAGADA EN LA FICHA sobre un tipo que SI lo lleva: la ficha manda y no debe salir por ningun lado.
const apagada = await montar({ tipo: tipoConPapel, codigo: 'APA', nombre: 'Papel apagado en la ficha', papelEnLaFicha: false });
comprobar(
  !!heredada.activityId && !!propia.activityId && !!apagada.activityId,
  'tres formaciones: heredada del tipo, propia de la ficha, y apagada en la ficha',
  'alguna no se creo',
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(2, 'DOS JORNADAS DE CADA UNA: una la dicta la ARL y otra la empresa');

async function jornada(versionId, quien, hora) {
  const r = await admin.post('/offerings', {
    activityVersionId: versionId, kind: 'EVENT', modality: 'PRESENCIAL',
    scheduledDate: hoy, startTime: hora, endTime: '18:00', location: `Salon ${SUFIJO}`,
    capacity: 10, intensityTheoryHours: 1, intensityPracticeHours: 1,
    ...(quien === 'PROPIOS' ? { executedBy: 'PROPIOS' } : { executedBy: 'ARL', executedByOther: 'ARL Colmena' }),
  });
  const id = r.cuerpo?.id;
  await admin.post(`/offerings/${id}/publish`, { confirm: true });
  return id;
}

const jornadas = {
  heredadaTercero: await jornada(heredada.versionId, 'ARL', '08:00'),
  heredadaPropios: await jornada(heredada.versionId, 'PROPIOS', '09:00'),
  propiaTercero: await jornada(propia.versionId, 'ARL', '10:00'),
  apagadaTercero: await jornada(apagada.versionId, 'ARL', '11:00'),
};
comprobar(Object.values(jornadas).every(Boolean), 'cuatro jornadas publicadas', JSON.stringify(jornadas));

let n = 0;
async function alta(nombre) {
  n += 1;
  const doc = `DP${marca}${n}`;
  const r = await admin.post('/users', {
    documentNumber: doc, fullName: `${nombre} ${SUFIJO}`,
    email: `${doc.toLowerCase()}@recorrido.test`, jobTitleId: cargo.id, areaId: area.id,
  });
  return { id: r.cuerpo?.id ?? r.cuerpo?.user?.id, doc, nombre: `${nombre} ${SUFIJO}` };
}

// Una persona por combinacion: mezclarlas en una sola haria imposible leer que fila es cual.
const gente = {
  heredadaTercero: await alta('Con ARL heredada'),
  heredadaPropios: await alta('Con propios heredada'),
  propiaTercero: await alta('Con ARL de ficha'),
  apagadaTercero: await alta('Con ARL apagada'),
};

async function cerrar(offeringId, userId) {
  const inscrito = await admin.post(`/offerings/${offeringId}/enroll`, { userIds: [userId] });
  if (!inscrito.ok) {
    console.log(`   (montaje) no se pudo inscribir en ${offeringId}: ${inscrito.estado} ${JSON.stringify(inscrito.cuerpo).slice(0, 160)}`);
    return null;
  }
  const fila = ((await admin.get(`/offerings/${offeringId}/roster`)).cuerpo?.items ?? []).find((f) => f.user?.id === userId);
  await admin.post(`/offerings/${offeringId}/attendance`, {
    heldOn: hoy, items: [{ enrollmentId: fila?.id, estado: 'PRESENT' }],
  });
  return fila?.id;
}

const inscripciones = {
  heredadaTercero: await cerrar(jornadas.heredadaTercero, gente.heredadaTercero.id),
  heredadaPropios: await cerrar(jornadas.heredadaPropios, gente.heredadaPropios.id),
  propiaTercero: await cerrar(jornadas.propiaTercero, gente.propiaTercero.id),
  apagadaTercero: await cerrar(jornadas.apagadaTercero, gente.apagadaTercero.id),
};
comprobar(Object.values(inscripciones).every(Boolean), 'las cuatro formaciones quedan cumplidas', JSON.stringify(inscripciones));
if (!Object.values(inscripciones).every(Boolean)) { resumen(); process.exit(1); }

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(3, 'LA MATRIZ: las dos puertas deciden lo MISMO en las cuatro combinaciones');

const papelesDe = async (userId) =>
  ((await admin.get(`/enrollments/con-papel-de-tercero?userId=${userId}`)).cuerpo ?? []).filter((f) =>
    f.actividad?.includes(SUFIJO),
  );
const jornadaDe = async (offeringId) => (await admin.get(`/offerings/${offeringId}`)).cuerpo;

/*
  LO ESPERADO, ESCRITO ANTES DE MIRAR NINGUN RESULTADO. Si se escribiera despues confirmaria lo que
  el sistema hace en vez de comprobar lo que debe hacer.
*/
const esperado = [
  { caso: 'heredadaTercero', sale: true, laDictaUnTercero: true, origen: 'HEREDADO', pantallaLoPide: true },
  { caso: 'heredadaPropios', sale: true, laDictaUnTercero: false, origen: 'HEREDADO', pantallaLoPide: false },
  { caso: 'propiaTercero', sale: true, laDictaUnTercero: true, origen: 'PROPIO', pantallaLoPide: true },
  { caso: 'apagadaTercero', sale: false, laDictaUnTercero: true, origen: null, pantallaLoPide: false },
];

for (const fila of esperado) {
  const suyas = await papelesDe(gente[fila.caso].id);
  const mia = suyas[0];
  comprobar(
    Boolean(mia) === fila.sale,
    fila.sale ? `[${fila.caso}] sale en su ficha` : `[${fila.caso}] NO sale: su ficha apaga lo que el tipo enciende`,
    `salen ${suyas.length} fila(s) y se esperaba ${fila.sale ? 1 : 0}`,
  );
  if (!fila.sale) continue;

  comprobar(mia.origen === fila.origen, `[${fila.caso}] dice de donde sale: ${mia.origen}`, `origen=${mia.origen}, esperado ${fila.origen}`);
  comprobar(
    mia.laDictaUnTercero === fila.laDictaUnTercero,
    `[${fila.caso}] sabe si la dicto un tercero: ${mia.laDictaUnTercero}`,
    `laDictaUnTercero=${mia.laDictaUnTercero}, esperado ${fila.laDictaUnTercero}`,
  );

  // LA COHERENCIA, que es lo que este recorrido viene a cerrar.
  const suJornada = await jornadaDe(jornadas[fila.caso]);
  comprobar(
    suJornada?.registraCertificadoExterno === fila.pantallaLoPide,
    `[${fila.caso}] la LISTA DE ASISTENCIA opina lo mismo: pide papel = ${suJornada?.registraCertificadoExterno}`,
    `la lista dice ${suJornada?.registraCertificadoExterno} y la ficha ${mia.laDictaUnTercero}`,
  );
  comprobar(
    Boolean(suJornada?.registraCertificadoExterno) === Boolean(mia.laDictaUnTercero),
    `[${fila.caso}] las dos puertas coinciden`,
    `lista=${suJornada?.registraCertificadoExterno} ficha=${mia.laDictaUnTercero}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(4, 'SE PUEDE ABRIR LO QUE LA FILA NOMBRA, que es lo que el cliente pidio');

const unaFila = (await papelesDe(gente.heredadaTercero.id))[0];
const laFormacion = await admin.get(`/activities/${unaFila?.actividadId}`);
comprobar(
  laFormacion.ok && laFormacion.cuerpo?.name?.includes(SUFIJO),
  `la fila trae el id de la formacion y abre: ${laFormacion.cuerpo?.name}`,
  `${laFormacion.estado} — sin esto, quien sospecha que una fila esta de mas no puede comprobarlo`,
);
const laJornada = await admin.get(`/offerings/${unaFila?.convocatoria?.id}`);
comprobar(
  laJornada.ok && laJornada.cuerpo?.code === unaFila?.convocatoria?.code,
  `y el de la convocatoria: ${unaFila?.convocatoria?.code}`,
  `${laJornada.estado} ${JSON.stringify(laJornada.cuerpo).slice(0, 120)}`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(5, 'ES UN DEFECTO DE PANTALLA, NO UNA COMPUERTA');

/*
  Con `PROPIOS` la pantalla no pide el numero — no hay tercero que lo expida— pero el servidor lo
  acepta igual: hay tenants que son centros de entrenamiento acreditados, y rechazarlo aqui seria
  convertir una suposicion nuestra sobre como trabajan las empresas en una regla del producto.
*/
const enPropios = await admin.patch(`/enrollments/${inscripciones.heredadaPropios}/papel-de-tercero`, {
  number: `PROPIOS-${marca}`,
  validUntil: vence,
});
comprobar(
  enPropios.ok,
  'una jornada dictada por la empresa SIGUE aceptando el papel por la API',
  `lo rechazo: ${enPropios.estado} ${JSON.stringify(enPropios.cuerpo).slice(0, 160)}`,
);

const trasGuardar = (await papelesDe(gente.heredadaPropios.id))[0];
comprobar(
  trasGuardar?.number === `PROPIOS-${marca}`,
  'y con el papel guardado la fila lo enseña, aunque la pantalla no lo pidiera',
  `numero=${trasGuardar?.number} — un dato registrado que no se ve no se puede ni corregir`,
);

// Y la que su FICHA apaga sigue rechazandose: esa si es compuerta.
const enApagada = await admin.patch(`/enrollments/${inscripciones.apagadaTercero}/papel-de-tercero`, {
  number: `NOVA-${marca}`,
});
comprobar(
  !enApagada.ok && enApagada.cuerpo?.code === 'TYPE_DOES_NOT_TRACK_EXTERNAL_CERT',
  'la formacion que NO lleva papel lo sigue rechazando: la compuerta esta donde debe',
  `lo acepto: ${enApagada.estado} ${JSON.stringify(enApagada.cuerpo).slice(0, 140)}`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(6, 'Y LLEGA HASTA EL FINAL: la obligacion y el informe de Vencimientos');

const conPapel = await admin.patch(`/enrollments/${inscripciones.heredadaTercero}/papel-de-tercero`, {
  number: `ARL-${marca}`,
  validUntil: vence,
});
comprobar(conPapel.ok, 'se registra el papel de la jornada que dicto la ARL', `${conPapel.estado}`);

const obligacion = ((await admin.get(`/assignments?targetId=${heredada.activityId}&userId=${gente.heredadaTercero.id}&pageSize=50`)).cuerpo?.items ?? [])
  .find((a) => a.status === 'COMPLETED');
comprobar(
  enBogota(obligacion?.validUntilOverride) === vence,
  `la obligacion recoge la vigencia del papel (${vence})`,
  `validUntilOverride=${enBogota(obligacion?.validUntilOverride)}`,
);

const informe = (await admin.get('/reportes/vencimientos?meses=24')).cuerpo;
const mias = (informe?.items ?? []).filter((f) => f.formacion?.includes(SUFIJO));
/*
  ACOTADO A LA PAREJA persona + formacion, y no a la persona sola: a cada una de las cuatro le
  nacieron las obligaciones de las TRES formaciones de esta corrida —comparten cargo— y buscar solo
  por persona devolveria tres filas correctas y las leeria como un duplicado.
*/
const suya = mias.filter(
  (f) => f.personaId === gente.heredadaTercero.id && f.formacion.includes('Papel heredado del tipo'),
);
comprobar(
  suya.length === 1,
  'sale UNA sola vez en Vencimientos, no una por cada tabla que guarda una fecha',
  `sale ${suya.length} vece(s): ${JSON.stringify(suya.map((f) => [f.clase, f.fuente]))}`,
);
comprobar(
  suya[0]?.clase === 'REPROGRAMAR',
  'y del lado de REPROGRAMAR: ya la tuvo, hay que volver a convocarla',
  `clase=${suya[0]?.clase}`,
);
comprobar(
  suya[0]?.fuente === 'PAPEL_DE_TERCERO',
  'diciendo segun QUE vence, que es lo que pregunta quien lo lee',
  `fuente=${suya[0]?.fuente}`,
);
comprobar(
  enBogota(suya[0]?.fecha) === vence,
  `con la fecha del PAPEL (${vence}) y no la que calcularia la recurrencia`,
  `fecha=${enBogota(suya[0]?.fecha)}`,
);

/*
  Y QUIEN NUNCA LA HA HECHO SALE DEL OTRO LADO. La persona de la formacion apagada tiene una
  obligacion abierta de las otras formaciones de este recorrido —le nacieron por su cargo— asi que
  hay con que comprobar el eje entero sin montar nada mas.
*/
const persiguen = mias.filter((f) => f.clase === 'PERSEGUIR');
comprobar(
  persiguen.length > 0,
  `y ${persiguen.length} fila(s) del lado de PERSEGUIR: obligaciones abiertas de quien nunca la cumplio`,
  'no hay ninguna fila de PERSEGUIR, y deberia haberlas: cuatro personas nuevas con obligaciones abiertas',
);
comprobar(
  persiguen.every((f) => f.fuente === 'OBLIGACION_ABIERTA'),
  'todas ellas por el plazo de su obligacion, no por un papel',
  `fuentes=${JSON.stringify([...new Set(persiguen.map((f) => f.fuente))])}`,
);

const dobles = new Map();
for (const fila of mias) {
  const clave = `${fila.personaId}|${fila.formacion}`;
  dobles.set(clave, (dobles.get(clave) ?? 0) + 1);
}
comprobar(
  [...dobles.values()].every((cuantas) => cuantas === 1),
  'ninguna persona sale dos veces por la misma formacion',
  `repetidas: ${JSON.stringify([...dobles.entries()].filter(([, c]) => c > 1))}`,
);

console.log(`\nCREADO PARA LIMPIAR: sufijo=${SUFIJO}`);
process.exit(resumen() === 0 ? 0 : 1);
