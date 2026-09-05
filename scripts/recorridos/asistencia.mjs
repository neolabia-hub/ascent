// RECORRIDO DE PUNTA A PUNTA: LAS TRES VIAS DE EVIDENCIA (Decision #157).
//
// ─── QUE HABIA ANTES, Y POR QUE ERA UN AGUJERO ───
//
// Una formacion solo se podia dar por cumplida de UNA forma: la persona entrando a la plataforma y
// completando el contenido. En una empresa bajo SG-SST la mayor parte del plan anual se dicta en
// salon —charlas de seguridad vial, brigadas, lo que trae la ARL— y de eso no queda contenido que
// completar: queda una hoja firmada. Todo lo presencial contaba como incumplido, y el indicador de
// cumplimiento enseñaba cero de lo que si se hizo.
//
//   A. En plataforma       contenido + examen                 -> lo cubren los otros recorridos
//   B. Lista de asistencia jornada con fecha, la dicte quien la dicte
//   C. Papel de un tercero certificado de un organismo acreditado
//
// ─── LO QUE ESTE RECORRIDO COMPRUEBA Y NINGUN OTRO MIRA ───
//
//   1. La asistencia va con el `kind` (EVENT) y NO con la modalidad: una PERMANENTE la rechaza.
//   2. Quien asistio queda CUMPLIDO sin tocar el contenido — que es el punto entero.
//   3. Quien NO asistio la sigue debiendo: no se cierra ni se retira nada.
//   4. Con papel de un tercero NO se emite constancia propia: dos papeles para un hecho es peor
//      que ninguno.
//   5. EL PAPEL MANDA: su fecha se copia a la obligacion y es la que decide cuando vuelve.
//   6. Y el certificado externo solo se acepta si el TIPO lo lleva (`tracksExternalCertificate`),
//      comprobado contra el SERVIDOR y no solo en la pantalla.
import { crearCliente, paso, ok, mal, comprobar, resumen } from './api.mjs';
import { comprobarSeguimiento } from './seguimiento.mjs';

/*
  LA FECHA SE LEE EN HORA DE COLOMBIA, y esta trampa ya mordio al recorrido del plan.

  Todo vencimiento se guarda al FIN DEL DIA en Bogota —"vence el 5" quiere decir que a las once de
  la noche del 5 todavia acredita— y eso en UTC cae el DIA SIGUIENTE a las 04:59. Comparar el
  `slice(0, 10)` del ISO contra la fecha que se mando da un dia de diferencia y parece un fallo del
  sistema cuando el fallo esta en la asercion.
*/
const enBogota = (iso) => (iso ? new Date(new Date(iso).getTime() - 5 * 3600000).toISOString().slice(0, 10) : null);

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;
const creado = { activityId: null, versionId: null, offeringId: null, ruleId: null, personas: [] };

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

paso(1, 'EL TIPO: el unico que nace acreditandose con el papel de un tercero');
const tipos = (await admin.get('/catalogs/activity-types')).cuerpo;
const tipo = tipos.find((t) => t.code === 'RECERTIFICACION');
comprobar(!!tipo, 'tipo "Recertificacion" existe', 'NO existe el tipo RECERTIFICACION');
if (!tipo) { resumen(); process.exit(1); }
comprobar(
  tipo.config?.tracksExternalCertificate === true,
  'lleva certificado de un tercero: la jornada pedira entidad, numero y vencimiento',
  'el tipo no tiene `tracksExternalCertificate`, y sin eso el certificado externo se rechaza',
);
/*
  EL TESTIGO TIENE QUE CUMPLIR DOS COSAS, y la segunda se me olvido la primera vez.

  Que NO lleve papel de tercero es lo que se quiere probar. Pero ademas no puede EXIGIR EVALUACION:
  la compuerta de la Decision #74 rechaza publicar una formacion sin lo que su tipo promete, asi que
  un testigo con examen obligatorio ni siquiera llega a la jornada. La pildora sirve justo por eso —
  es el tipo que se define por lo que NO hace— y el respaldo busca cualquiera con las dos.
*/
const otro =
  tipos.find((t) => t.code === 'PILDORA') ??
  tipos.find((t) => t.config?.tracksExternalCertificate !== true && t.config?.requiresAssessment !== true);
comprobar(!!otro, `el testigo sin papel de tercero sera "${otro?.name}"`, 'no hay ningun tipo sin certificado externo y sin examen obligatorio');
if (!otro) { resumen(); process.exit(1); }

const procesos = (await admin.get('/catalogs/processes')).cuerpo;
const proceso = procesos.find((p) => p.active) ?? procesos[0];
const cargos = ((await admin.get('/catalogs/job-titles')).cuerpo ?? []).filter((x) => x.active);
const areas = ((await admin.get('/catalogs/areas')).cuerpo ?? []).filter((x) => x.active);
const area = areas[0];

// El cargo MENOS poblado: exigir la formacion crea la obligacion a todo el que ya lo tenga, y con
// "Conductor" serian cuatrocientas asignaciones de mentira que alguien tendria que limpiar.
const poblacion = new Map();
for (const c of cargos) {
  poblacion.set(c.id, (await admin.post('/audiences/preview', { match: 'ALL', jobTitleIds: [c.id] })).cuerpo?.count ?? 0);
}
const cargo = [...cargos].sort((a, b) => poblacion.get(a.id) - poblacion.get(b.id))[0];
console.log(`   ... el cargo sera "${cargo.name}" (${poblacion.get(cargo.id)} personas hoy)`);

paso(2, 'LA FICHA, EL CONTENIDO Y EL EXAMEN');
const ficha = await admin.post('/activities', {
  code: `ASIST_${SUFIJO}`,
  name: `Habilitacion montacargas ${SUFIJO}`,
  description: 'La dicta la ARL en el patio; el papel lo emite ella y la empresa vigila su vigencia.',
  activityTypeId: tipo.id, processId: proceso.id, modality: 'PRESENCIAL',
});
comprobar(ficha.ok, `ficha creada (${ficha.estado})`, `ficha: ${ficha.estado} ${JSON.stringify(ficha.cuerpo).slice(0, 250)}`);
creado.activityId = ficha.cuerpo?.id;
if (!creado.activityId) { resumen(); process.exit(1); }
creado.versionId = ((await admin.get(`/activities/${creado.activityId}`)).cuerpo?.versions ?? []).find((v) => v.status === 'DRAFT')?.id;

const leccion = await admin.post('/lessons', { title: `Inspeccion previa ${SUFIJO}`, estimatedMinutes: 10 });
await admin.pedir(`/lessons/${leccion.cuerpo.id}/cards`, { method: 'PUT', body: JSON.stringify({
  cards: [{ payload: { cardType: 'TEXT_IMAGE', title: 'Antes de operar', body: 'Inspeccion previa del equipo.' } }],
}) });
await admin.post(`/activities/versions/${creado.versionId}/contents`, {
  type: 'LESSON', title: 'Inspeccion previa', isRequired: true, config: { minSeconds: 1 }, lessonId: leccion.cuerpo.id,
});
const pregunta = await admin.post('/questions', {
  payload: {
    qtype: 'SINGLE', stem: 'Antes de operar el montacargas...',
    options: [{ id: 'a', text: 'Se inspecciona el equipo' }, { id: 'b', text: 'Se arranca y ya' }],
    correctOptionId: 'a', points: 1,
  },
});
const examen = await admin.post('/assessments', { title: `Examen ${SUFIJO}` });
await admin.patch(`/assessments/${examen.cuerpo.id}`, {
  passingScore: 80, maxAttempts: 3, sections: [{ mode: 'FIXED', questionIds: [pregunta.cuerpo?.id] }],
});
await admin.post(`/activities/versions/${creado.versionId}/contents`, {
  type: 'ASSESSMENT', title: 'Examen', isRequired: true, config: {}, assessmentId: examen.cuerpo.id,
});
const publicada = await admin.post(`/activities/versions/${creado.versionId}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
comprobar(publicada.ok, `publicada (${publicada.estado})`, `publicar: ${publicada.estado} ${JSON.stringify(publicada.cuerpo).slice(0, 250)}`);
/*
  EL EXAMEN ES OBLIGATORIO Y NADIE LO VA A RESPONDER, Y ESO ES EL PUNTO.

  El tipo exige evaluacion; la jornada la dicta la ARL y el examen lo pone el instructor en el
  salon. Si cerrar por asistencia pasara por la misma puerta que el aprendiz, aqui diria "falta el
  examen" para siempre. No es un atajo alrededor de la regla: es que la evidencia es OTRA, y por eso
  queda escrito QUIEN respondio por ella (`attendance_records.marked_by`).
*/

paso(3, 'EXIGIRLA AL CARGO, y dos personas que la deben');
const requisito = await admin.post(`/activities/${creado.activityId}/requirements`, {
  scope: { match: 'ALL', jobTitleIds: [cargo.id] },
  trigger: 'ON_JOIN', dueDaysAfterTrigger: 30,
  everyMonths: 12, soloNuevos: true,
});
comprobar(requisito.ok, `exigida al cargo "${cargo.name}" (${requisito.estado})`, `requisito: ${requisito.estado} ${JSON.stringify(requisito.cuerpo).slice(0, 250)}`);
creado.ruleId = requisito.cuerpo?.id ?? requisito.cuerpo?.ruleId;

const alta = async (n) => {
  const doc = `AS${marca}${n}`;
  const r = await admin.post('/users', {
    documentNumber: doc, fullName: `Operario ${n} ${SUFIJO}`,
    email: `${doc.toLowerCase()}@recorrido.test`, jobTitleId: cargo.id, areaId: area.id,
  });
  return { ok: r.ok, id: r.cuerpo?.id ?? r.cuerpo?.user?.id, doc, clave: r.cuerpo?.generatedPassword ?? r.cuerpo?.password };
};
const elQueVa = await alta(1);
const elQueFalta = await alta(2);
creado.personas = [elQueVa.id, elQueFalta.id];
comprobar(elQueVa.ok && elQueFalta.ok, 'entran dos personas con ese cargo y les nace su obligacion', 'no se pudieron crear las dos personas');

const suyas = async (uid) => ((await admin.get(`/assignments?targetId=${creado.activityId}&userId=${uid}&pageSize=50`)).cuerpo?.items ?? []);
comprobar((await suyas(elQueVa.id)).length === 1, 'al primero le nace UNA obligacion', 'no le nacio una sola');

paso(4, 'LA JORNADA, dictada por la ARL, y los dos convocados');
const fecha = new Date().toISOString().slice(0, 10);
const jornada = await admin.post('/offerings', {
  activityVersionId: creado.versionId, kind: 'EVENT', modality: 'PRESENCIAL',
  scheduledDate: fecha, startTime: '08:00', endTime: '16:00',
  location: `Patio de maniobras ${SUFIJO}`,
  executedBy: 'ARL', executedByOther: 'ARL Sura',
  capacity: 20, intensityTheoryHours: 4, intensityPracticeHours: 4,
});
comprobar(jornada.ok, `jornada programada y dictada por un tercero (${jornada.estado})`, `jornada: ${jornada.estado} ${JSON.stringify(jornada.cuerpo).slice(0, 250)}`);
creado.offeringId = jornada.cuerpo?.id;
await admin.post(`/offerings/${creado.offeringId}/publish`, { confirm: true });
const convocar = await admin.post(`/offerings/${creado.offeringId}/enroll`, { userIds: [elQueVa.id, elQueFalta.id] });
comprobar(convocar.ok, 'los dos quedan convocados', `convocar: ${convocar.estado} ${JSON.stringify(convocar.cuerpo).slice(0, 200)}`);

const lista = (await admin.get(`/offerings/${creado.offeringId}/roster`)).cuerpo?.items ?? [];
comprobar(lista.length === 2, 'la lista de la jornada trae a los dos', `trae ${lista.length}`);
const inscVa = lista.find((f) => f.user.id === elQueVa.id);
const inscFalta = lista.find((f) => f.user.id === elQueFalta.id);
comprobar(
  inscVa?.attendanceStatus === null && inscVa?.extCertNumber === null,
  'y abre en blanco: nadie ha marcado asistencia todavia',
  'la lista viene con asistencia ya marcada, y no deberia',
);

paso(5, 'LA COMPUERTA DEL TIPO, contra el SERVIDOR y no contra la pantalla');
/*
  Que una clase de formacion se acredite con el papel de un tercero lo decide la empresa en el tipo.
  Aqui se comprueba al reves de lo normal: se manda un certificado a una formacion cuyo tipo NO lo
  lleva, y tiene que rechazarlo el servidor. Un control que solo vive en el navegador no es control.
*/
const conTipoSinPapel = await admin.post('/activities', {
  code: `ASISTNO_${SUFIJO}`, name: `Charla vial ${SUFIJO}`,
  description: 'Charla generica que no certifica nada.',
  activityTypeId: otro.id, processId: proceso.id, modality: 'PRESENCIAL',
});
comprobar(conTipoSinPapel.ok, `ficha testigo creada con el tipo "${otro?.name}"`, `ficha testigo: ${conTipoSinPapel.estado} ${JSON.stringify(conTipoSinPapel.cuerpo).slice(0, 220)}`);
const versionSinPapel = ((await admin.get(`/activities/${conTipoSinPapel.cuerpo?.id}`)).cuerpo?.versions ?? []).find((v) => v.status === 'DRAFT')?.id;
const leccion2 = await admin.post('/lessons', { title: `Charla ${SUFIJO}`, estimatedMinutes: 5 });
await admin.pedir(`/lessons/${leccion2.cuerpo.id}/cards`, { method: 'PUT', body: JSON.stringify({
  cards: [{ payload: { cardType: 'TEXT_IMAGE', title: 'Vial', body: 'Cinturon siempre.' } }],
}) });
await admin.post(`/activities/versions/${versionSinPapel}/contents`, {
  type: 'LESSON', title: 'Charla', isRequired: true, config: { minSeconds: 1 }, lessonId: leccion2.cuerpo.id,
});
const publicaTestigo = await admin.post(`/activities/versions/${versionSinPapel}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
comprobar(publicaTestigo.ok, 'la testigo se publica', `publicar testigo: ${publicaTestigo.estado} ${JSON.stringify(publicaTestigo.cuerpo).slice(0, 250)}`);
const jornada2 = await admin.post('/offerings', {
  activityVersionId: versionSinPapel, kind: 'EVENT', modality: 'PRESENCIAL',
  scheduledDate: fecha, startTime: '09:00', endTime: '10:00', location: `Sala ${SUFIJO}`, capacity: 10,
});
comprobar(jornada2.ok, 'jornada testigo programada', `jornada testigo: ${jornada2.estado} ${JSON.stringify(jornada2.cuerpo).slice(0, 250)}`);
const pubJornada2 = await admin.post(`/offerings/${jornada2.cuerpo?.id}/publish`, { confirm: true });
comprobar(pubJornada2.ok, 'jornada testigo publicada', `publicar jornada testigo: ${pubJornada2.estado} ${JSON.stringify(pubJornada2.cuerpo).slice(0, 250)}`);
const convocarTestigo = await admin.post(`/offerings/${jornada2.cuerpo?.id}/enroll`, { userIds: [elQueFalta.id] });
comprobar(convocarTestigo.ok, 'y hay alguien convocado en ella', `convocar testigo: ${convocarTestigo.estado} ${JSON.stringify(convocarTestigo.cuerpo).slice(0, 250)}`);
const lista2 = (await admin.get(`/offerings/${jornada2.cuerpo?.id}/roster`)).cuerpo?.items ?? [];
comprobar(lista2.length === 1, 'la lista de la testigo trae a esa persona', `trae ${lista2.length}`);
const rechazo = await admin.post(`/offerings/${jornada2.cuerpo?.id}/attendance`, {
  items: [{ enrollmentId: lista2[0]?.id, estado: 'PRESENT', certificate: { issuer: 'ARL Sura', number: 'X-1' } }],
});
comprobar(
  rechazo.estado === 409 && rechazo.cuerpo?.code === 'TYPE_DOES_NOT_TRACK_EXTERNAL_CERT',
  'un certificado de tercero en un tipo que no lo lleva se rechaza con 409',
  `esperaba 409 TYPE_DOES_NOT_TRACK_EXTERNAL_CERT y vino ${rechazo.estado} ${JSON.stringify(rechazo.cuerpo).slice(0, 200)}`,
);
// Y sin certificado, la MISMA jornada si cierra: la charla generica se acredita por asistencia sola.
const soloAsistencia = await admin.post(`/offerings/${jornada2.cuerpo?.id}/attendance`, {
  items: [{ enrollmentId: lista2[0]?.id, estado: 'PRESENT' }],
});
comprobar(
  soloAsistencia.ok && soloAsistencia.cuerpo?.cerradas === 1,
  'y sin papel SI cierra: una charla presencial que no certifica nada se acredita por asistencia sola',
  `asistencia sin papel: ${soloAsistencia.estado} ${JSON.stringify(soloAsistencia.cuerpo).slice(0, 200)}`,
);

paso(6, 'LA ASISTENCIA VA CON EL `kind`, NO CON LA MODALIDAD');
/*
  La convocatoria PERMANENTE de autoservicio no se cierra por asistencia: ahi la persona entra sola
  cuando puede y la evidencia es justamente lo que registro la plataforma. Se comprueba contra una
  formacion de las que abren convocatoria permanente al publicar.
*/
const permanentes = ((await admin.get('/offerings?pageSize=50')).cuerpo?.items ?? []).filter((o) => o.kind === 'PERMANENT');
if (permanentes.length === 0) {
  ok('no hay ninguna convocatoria permanente viva ahora mismo: nada que comprobar aqui');
} else {
  const noVa = await admin.post(`/offerings/${permanentes[0].id}/attendance`, {
    items: [{ enrollmentId: '00000000-0000-4000-8000-000000000000', estado: 'PRESENT' }],
  });
  comprobar(
    noVa.estado === 409 && noVa.cuerpo?.code === 'OFFERING_NOT_ATTENDABLE',
    'una convocatoria de autoservicio rechaza la lista de asistencia con 409',
    `esperaba 409 OFFERING_NOT_ATTENDABLE y vino ${noVa.estado} ${JSON.stringify(noVa.cuerpo).slice(0, 200)}`,
  );
}

paso(7, 'SE TOMA LA ASISTENCIA: uno vino con su certificado, el otro no vino');
/*
  EL VENCIMIENTO DEL PAPEL, A 30 DIAS, Y NO ES UN CAPRICHO.

  Es el mismo truco que usa `reinduccion-ciclos.mjs` con la recurrencia: se comprime lo que se puede
  comprimir para no esperar un ano. La ventana en que nace la ronda siguiente esta fijada en 60
  dias, asi que un papel que vence dentro de 30 la tiene abierta HOY. Si el papel manda de verdad,
  al empujar el motor tiene que nacer la ronda 2 venciendo el dia que dice el papel — y no dentro de
  doce meses, que es lo que dice la recurrencia del tipo. Es la unica forma de medir "manda el
  papel" sin tocar el reloj.
*/
const venceElPapel = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
const asistencia = await admin.post(`/offerings/${creado.offeringId}/attendance`, {
  heldOn: fecha,
  items: [
    {
      enrollmentId: inscVa.id,
      estado: 'PRESENT',
      certificate: { issuer: 'ARL Sura', number: `MC-${marca}`, issuedAt: fecha, validUntil: venceElPapel },
    },
    { enrollmentId: inscFalta.id, estado: 'ABSENT' },
  ],
});
comprobar(asistencia.ok, `asistencia guardada (${asistencia.estado})`, `asistencia: ${asistencia.estado} ${JSON.stringify(asistencia.cuerpo).slice(0, 250)}`);
console.log(`   ... revisadas=${asistencia.cuerpo?.revisadas} cerradas=${asistencia.cuerpo?.cerradas} ausentes=${asistencia.cuerpo?.ausentes}`);
comprobar(asistencia.cuerpo?.cerradas === 1, 'se cierra UNA: la del que asistio', `cerradas=${asistencia.cuerpo?.cerradas}`);
comprobar(asistencia.cuerpo?.ausentes === 1, 'y una queda como ausente', `ausentes=${asistencia.cuerpo?.ausentes}`);

paso(8, 'QUIEN ASISTIO QUEDA CUMPLIDO SIN HABER TOCADO EL CONTENIDO');
const trasAsistir = await suyas(elQueVa.id);
const cumplida = trasAsistir.find((a) => a.status === 'COMPLETED');
console.log(`   ... tiene ${trasAsistir.length}: ${trasAsistir.map((a) => `#${a.cycleNumber} ${a.status}`).join(' · ')}`);
comprobar(
  !!cumplida,
  'su obligacion queda CUMPLIDA, y el examen del tipo no lo respondio nadie en la plataforma',
  `no quedo cumplida: ${trasAsistir.map((a) => a.status).join(', ')}`,
);
const listaTras = (await admin.get(`/offerings/${creado.offeringId}/roster`)).cuerpo?.items ?? [];
const filaVa = listaTras.find((f) => f.user.id === elQueVa.id);
comprobar(filaVa?.attendanceStatus === 'PRESENT', 'y consta COMO consta: por asistencia, no por la plataforma', 'no quedo la marca de asistencia');
comprobar(
  filaVa?.extCertNumber === `MC-${marca}` && (filaVa?.extCertIssuer ?? '').length > 0,
  `el papel queda registrado: ${filaVa?.extCertIssuer} · ${filaVa?.extCertNumber}`,
  'no se guardaron los datos del certificado del tercero',
);

paso(9, 'Y QUIEN NO VINO LA SIGUE DEBIENDO: eso es lo que hace util tomar asistencia');
const trasFaltar = await suyas(elQueFalta.id);
const viva = trasFaltar.filter((a) => ['PENDING', 'IN_PROGRESS', 'OVERDUE'].includes(a.status));
console.log(`   ... tiene ${trasFaltar.length}: ${trasFaltar.map((a) => a.status).join(', ')}`);
comprobar(viva.length === 1, 'sigue con su obligacion viva: no se cerro y no se retiro', `tiene ${viva.length} vivas`);
const filaFalta = listaTras.find((f) => f.user.id === elQueFalta.id);
comprobar(filaFalta?.attendanceStatus === 'ABSENT', 'y en la lista consta que se le convoco y no asistio', 'quedo marcado como asistente');

paso(10, 'CON PAPEL DE UN TERCERO NO SE EMITE CONSTANCIA PROPIA');
/*
  Dos papeles con dos numeros para un mismo hecho es peor, en una auditoria, que no tener ninguno.
  El documento que vale es el del organismo acreditado. Al reves —una charla presencial que NO
  certifica nada— la constancia propia SI se emite, y es lo que se comprobo en el paso 5.
*/
const aprendiz = crearCliente();
let entro = false;
try { await aprendiz.entrar(elQueVa.doc, elQueVa.clave); entro = true; } catch (e) { mal(`el operario no pudo entrar: ${e.message}`); }
if (entro) {
  const cert = (await aprendiz.get('/me/certificados')).cuerpo;
  const items = cert?.items ?? cert ?? [];
  const suya = (items.find?.((c) => c.activityName?.includes(SUFIJO) || c.activity?.id === creado.activityId)) ?? null;
  comprobar(
    !suya,
    'no se emite constancia propia: el papel que vale es el de la ARL',
    'se emitio una constancia propia encima del certificado del tercero',
  );
}

paso(11, 'EL PAPEL MANDA: la ronda siguiente vence el dia que dice el certificado');
comprobar(
  enBogota(cumplida?.validUntilOverride) === venceElPapel,
  `la obligacion guarda el vencimiento del papel (${venceElPapel}), no el que calcularia la recurrencia`,
  `validUntilOverride=${enBogota(cumplida?.validUntilOverride)} y el papel dice ${venceElPapel}`,
);
// Se empuja el motor sobre esta persona, que es lo que hara el cron cada hora.
const empujon = await admin.patch(`/users/${elQueVa.id}`, { areaId: area.id });
comprobar(empujon.ok, 'el motor vuelve a pasar por esta persona', `patch: ${empujon.estado}`);
const rondas = (await suyas(elQueVa.id)).sort((a, b) => (a.cycleNumber ?? 0) - (b.cycleNumber ?? 0));
console.log(`   ... ahora tiene ${rondas.length}: ${rondas.map((a) => `#${a.cycleNumber} ${a.status} vence ${enBogota(a.dueAt)}`).join(' · ')}`);
const ronda2 = rondas.find((a) => a.cycleNumber === 2);
comprobar(
  !!ronda2,
  'nace la RONDA 2, porque el papel vence dentro de la ventana de 60 dias',
  'no nacio la ronda 2: con la recurrencia de 12 meses no tocaria, y el papel dice que si',
);
comprobar(
  enBogota(ronda2?.dueAt) === venceElPapel,
  `y vence el dia que dice el papel (${venceElPapel}), no a los 12 meses de la recurrencia`,
  `la ronda 2 vence ${enBogota(ronda2?.dueAt)} y el papel dice ${venceElPapel}`,
);

paso(12, 'LA FALTA JUSTIFICADA: se explica, pero NO exime');
/*
  El tercer estado del diseno (CLAUDE.md 3.7), y el que mas facil se malinterpreta. "Estaba
  incapacitado" explica por que no vino a ESTA jornada; no dice que ya no tenga que formarse. La
  obligacion sigue viva y esa persona ira a la siguiente. Eximir es otro acto, deliberado, con su
  propio motivo y su propia auditoria — confundirlos convertiria una incapacidad en un permiso
  permanente para no capacitarse.
*/
const justificar = await admin.post(`/offerings/${creado.offeringId}/attendance`, {
  heldOn: fecha,
  items: [{ enrollmentId: inscFalta.id, estado: 'JUSTIFIED', motivo: 'Incapacidad medica del 3 al 8.' }],
});
comprobar(justificar.ok && justificar.cuerpo?.justificados === 1, `falta justificada registrada (${justificar.estado})`, `justificar: ${justificar.estado} ${JSON.stringify(justificar.cuerpo).slice(0, 220)}`);

const sinMotivo = await admin.post(`/offerings/${creado.offeringId}/attendance`, {
  items: [{ enrollmentId: inscFalta.id, estado: 'JUSTIFIED' }],
});
comprobar(
  sinMotivo.estado === 422,
  'y una justificacion SIN motivo se rechaza: no justifica nada, y es lo que lee el auditor',
  `esperaba 422 y vino ${sinMotivo.estado}`,
);

const listaJust = (await admin.get(`/offerings/${creado.offeringId}/roster`)).cuerpo?.items ?? [];
const filaJust = listaJust.find((f) => f.user.id === elQueFalta.id);
comprobar(
  filaJust?.attendanceStatus === 'JUSTIFIED' && (filaJust?.attendanceNote ?? '').length > 0,
  `queda el estado y el motivo: "${filaJust?.attendanceNote}"`,
  `estado=${filaJust?.attendanceStatus} motivo=${filaJust?.attendanceNote}`,
);
comprobar(
  filaJust?.attendanceMethod === 'INSTRUCTOR',
  'y COMO se marco: lista del instructor, el primero de los tres metodos que preve el diseno',
  `metodo=${filaJust?.attendanceMethod}`,
);
const trasJustificar = (await suyas(elQueFalta.id)).filter((a) => ['PENDING', 'IN_PROGRESS', 'OVERDUE'].includes(a.status));
comprobar(
  trasJustificar.length === 1,
  'y la formacion SIGUE debiendose: justificar la falta no exime, ira a la jornada siguiente',
  `una falta justificada le quito la obligacion (${trasJustificar.length} vivas)`,
);

paso(13, 'DOS REGLAS SOBRE LA MISMA PERSONA: la asistencia cierra UNA obligacion');
/*
  El caso que aparece en cuanto una formacion se exige por dos caminos que alcanzan a la misma
  gente —por cargo Y por area—. Hoy le nacen DOS obligaciones, porque la deduplicacion del motor es
  POR REGLA, y asistir a UNA jornada cierra UNA. Se mide en vez de suponerlo, porque de aqui sale
  el numero del auditor: si asistir cerrara las dos, una jornada cubriria dos requisitos distintos;
  si no cerrara ninguna, quien fue seguiria en rojo.
*/
const reglaPorArea = await admin.post(`/activities/${creado.activityId}/requirements`, {
  scope: { match: 'ALL', areaIds: [area.id] },
  trigger: 'ON_JOIN', dueDaysAfterTrigger: 30, everyMonths: 12, soloNuevos: true,
});
comprobar(reglaPorArea.ok, `segunda regla, ahora por area "${area.name}" (${reglaPorArea.estado})`, `regla por area: ${reglaPorArea.estado} ${JSON.stringify(reglaPorArea.cuerpo).slice(0, 220)}`);
const dosReglas = (await admin.get(`/activities/${creado.activityId}/requirements`)).cuerpo ?? [];
comprobar(dosReglas.length === 2, 'la formacion tiene DOS requisitos vivos', `tiene ${dosReglas.length}`);

const doblePersona = await alta(3);
creado.personas.push(doblePersona.id);
const dobles = await suyas(doblePersona.id);
console.log(`   ... a quien cumple las dos reglas le nacen ${dobles.length}: ${dobles.map((a) => a.status).join(', ')}`);
comprobar(
  dobles.length === 2,
  'a quien cumple las dos le nacen DOS obligaciones — la deduplicacion del motor es por REGLA',
  `le nacieron ${dobles.length}, y con dos reglas que la alcanzan deberian ser 2`,
);

const jornada3 = await admin.post('/offerings', {
  activityVersionId: creado.versionId, kind: 'EVENT', modality: 'PRESENCIAL',
  scheduledDate: fecha, startTime: '14:00', endTime: '16:00', location: `Patio 2 ${SUFIJO}`,
  executedBy: 'ARL', capacity: 10, intensityTheoryHours: 1, intensityPracticeHours: 1,
});
comprobar(jornada3.ok, 'segunda jornada programada', `jornada 3: ${jornada3.estado} ${JSON.stringify(jornada3.cuerpo).slice(0, 220)}`);
const pub3 = await admin.post(`/offerings/${jornada3.cuerpo?.id}/publish`, { confirm: true });
comprobar(pub3.ok, 'y publicada', `publicar jornada 3: ${pub3.estado} ${JSON.stringify(pub3.cuerpo).slice(0, 220)}`);
const conv3 = await admin.post(`/offerings/${jornada3.cuerpo?.id}/enroll`, { userIds: [doblePersona.id] });
comprobar(conv3.ok, 'se le convoca a ella', `convocar 3: ${conv3.estado} ${JSON.stringify(conv3.cuerpo).slice(0, 220)}`);
const lista3 = (await admin.get(`/offerings/${jornada3.cuerpo?.id}/roster`)).cuerpo?.items ?? [];
comprobar(lista3.length === 1, 'la lista de la segunda jornada la trae', `trae ${lista3.length}`);
const cierraUna = await admin.post(`/offerings/${jornada3.cuerpo?.id}/attendance`, {
  heldOn: fecha,
  items: [{ enrollmentId: lista3[0]?.id, estado: 'PRESENT' }],
});
comprobar(cierraUna.ok && cierraUna.cuerpo?.cerradas === 1, 'asiste, y se cierra UNA obligacion', `cerradas=${cierraUna.cuerpo?.cerradas} ${JSON.stringify(cierraUna.cuerpo).slice(0, 200)}`);
const trasLaJornada = await suyas(doblePersona.id);
const vivasDoble = trasLaJornada.filter((a) => ['PENDING', 'IN_PROGRESS', 'OVERDUE'].includes(a.status));
console.log(`   ... ahora tiene ${trasLaJornada.length}: ${trasLaJornada.map((a) => a.status).join(', ')}`);
comprobar(
  trasLaJornada.filter((a) => a.status === 'COMPLETED').length === 1 && vivasDoble.length === 1,
  'una queda CUMPLIDA y la otra sigue viva: una jornada no cierra dos requisitos distintos',
  `cumplidas=${trasLaJornada.filter((a) => a.status === 'COMPLETED').length} vivas=${vivasDoble.length}`,
);

paso(14, 'ACOTAMIENTO: las facetas se CRUZAN, y una lista no alcanza fuera de su jornada');
/*
  Que las facetas se cruzan y no se suman lo mide `tajadas.mjs` para los siete tipos. Aqui se
  comprueba lo de al lado, que es lo propio de la asistencia: **una lista no puede cerrar la
  formacion de quien no estuvo en esa sala**. Se intenta a proposito colar la inscripcion de otra
  jornada; si eso funcionara, tomar una lista daria por cumplida a gente que nunca fue.
*/
const facetas = {
  cargo: (await admin.post('/audiences/preview', { match: 'ALL', jobTitleIds: [cargo.id] })).cuerpo?.count ?? 0,
  area: (await admin.post('/audiences/preview', { match: 'ALL', areaIds: [area.id] })).cuerpo?.count ?? 0,
  cruzada: (await admin.post('/audiences/preview', { match: 'ALL', jobTitleIds: [cargo.id], areaIds: [area.id] })).cuerpo?.count ?? 0,
};
console.log(`   ... cargo ${facetas.cargo} · area ${facetas.area} · las dos cruzadas ${facetas.cruzada}`);
comprobar(
  facetas.cruzada <= Math.min(facetas.cargo, facetas.area),
  'cruzar dos facetas nunca alcanza a mas que la menor de las dos: se cruza, no se suma',
  `cruzada=${facetas.cruzada} cargo=${facetas.cargo} area=${facetas.area}`,
);
const colarse = await admin.post(`/offerings/${jornada3.cuerpo?.id}/attendance`, {
  heldOn: fecha,
  items: [{ enrollmentId: inscFalta.id, estado: 'PRESENT' }],
});
comprobar(
  colarse.ok && colarse.cuerpo?.cerradas === 0 && (colarse.cuerpo?.ignoradas ?? []).length === 1,
  'y la inscripcion de OTRA jornada se ignora: una lista no cierra la formacion de quien no estuvo',
  `cerradas=${colarse.cuerpo?.cerradas} ignoradas=${(colarse.cuerpo?.ignoradas ?? []).length}`,
);

await comprobarSeguimiento(admin, creado.activityId, { numeroDePaso: 15 });

console.log(`\nCREADO PARA LIMPIAR: actividades=${creado.activityId},${conTipoSinPapel.cuerpo?.id} personas=${creado.personas.join(',')} sufijo=${SUFIJO}`);
process.exit(resumen() === 0 ? 0 : 1);
