// RECORRIDO DE PUNTA A PUNTA: UN PROGRAMA DE INDUCCION Y OTRO DE REINDUCCION (2026-10-06).
//
// Pedido del cliente: probar la induccion y la reinduccion COMO PROGRAMA, que es como se certifican
// (la constancia que vale es la del conjunto, no la de cada modulo).
//
//   INDUCCION    sus modulos se exigen solos a quien INGRESA. A una persona antigua se le da el
//                programa entero A MANO («O a personas concretas» del programa).
//   REINDUCCION  sus modulos vuelven cada 12 meses desde la FECHA DE INGRESO: le aparecen a quien
//                tiene el aniversario cerca, no a todos; y la constancia del programa vale hasta el
//                aniversario SIGUIENTE de esa persona.
//
// Con tipos PROPIOS, para no tocar los de la empresa.

import { crearCliente, paso, ok, mal, comprobar, resumen } from './api.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;
const ANTELACION = 45;

function fecha({ meses = 0, dias = 0 }) {
  const hoy = new Date(Date.now() - 5 * 60 * 60 * 1000);
  const base = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + meses, hoy.getUTCDate()));
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}
/** Suma meses a AAAA-MM-DD cayendo en el ultimo dia si el mes destino es mas corto, como el motor. */
function masMeses(texto, meses) {
  const [a, m, d] = texto.split('-').map(Number);
  const total = a * 12 + (m - 1) + meses;
  const anio = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return `${anio}-${String(mes).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
}
const diaCivil = (instante) => new Date(new Date(instante).getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

const procesos = (await admin.get('/catalogs/processes')).cuerpo ?? [];
const proceso = procesos.find((p) => p.active) ?? procesos[0];
const cargo = ((await admin.get('/catalogs/job-titles')).cuerpo ?? []).find((c) => c.active);
const area = ((await admin.get('/catalogs/areas')).cuerpo ?? []).find((a) => a.active);
const reglasCreadas = [];
const tiposCreados = [];

paso(1, 'LOS DOS TIPOS: induccion de ingreso, y reinduccion cada 12 meses desde el ingreso');
const comun = { requiresAssessment: false, requiresSurvey: false, issuesCertificate: true, defaultOfferingKind: 'PERMANENT', defaultAssignmentMode: 'ON_HIRE' };
const tipoInd = await admin.post('/catalogs/activity-types', {
  code: `E2E_PI_${marca}`, name: `Induccion de programa ${SUFIJO}`,
  config: { ...comun, requiresBeforeHire: true },
});
const tipoRein = await admin.post('/catalogs/activity-types', {
  code: `E2E_PR_${marca}`, name: `Reinduccion de programa ${SUFIJO}`,
  config: {
    ...comun, requiresBeforeHire: false, defaultRecurrenceMonths: 12, defaultRecurrenceAnchor: 'HIRE',
    defaultWindowDays: ANTELACION, defaultOnExpiry: 'CIERRA',
  },
});
comprobar(tipoInd.ok && tipoRein.ok, 'tipos creados', `tipos: ${tipoInd.estado} ${tipoRein.estado} ${JSON.stringify(tipoRein.cuerpo).slice(0, 200)}`);
if (!tipoInd.ok || !tipoRein.ok) { resumen(); process.exit(1); }
tiposCreados.push(tipoInd.cuerpo.id, tipoRein.cuerpo.id);

paso(2, 'LA PERSONA ANTIGUA: ya estaba, y su aniversario de ingreso es en 40 dias');
const ingresoAntigua = fecha({ meses: -12, dias: 40 });
const altaAntigua = await admin.post('/users', {
  documentNumber: `81${marca}`, fullName: `Antigua de programa ${SUFIJO}`, jobTitleId: cargo.id, areaId: area.id, hiredAt: ingresoAntigua,
});
const antigua = { id: altaAntigua.cuerpo?.user?.id, documento: `81${marca}`, clave: altaAntigua.cuerpo?.generatedPassword };
comprobar(altaAntigua.ok && !!antigua.id, `creada, con ingreso el ${ingresoAntigua}`, `alta: ${altaAntigua.estado} ${JSON.stringify(altaAntigua.cuerpo).slice(0, 200)}`);

/** Una formacion con una leccion, publicada. El tipo no pide examen, asi que cierra con el contenido. */
async function crearModulo(tipoId, nombre, horas) {
  const ficha = await admin.post('/activities', {
    code: `PIR${marca}_${nombre.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`, name: `${nombre} ${SUFIJO}`, activityTypeId: tipoId, processId: proceso.id,
    modality: 'VIRTUAL', issuesCertificate: true, certificateHours: horas,
  });
  if (!ficha.ok) { mal(`crear ${nombre}: ${ficha.estado} ${JSON.stringify(ficha.cuerpo).slice(0, 200)}`); return null; }
  const activityId = ficha.cuerpo.id;
  const versionId = ((await admin.get(`/activities/${activityId}`)).cuerpo?.versions ?? []).find((v) => v.status === 'DRAFT')?.id;
  const leccion = await admin.post('/lessons', { title: `Contenido ${nombre} ${SUFIJO}`, estimatedMinutes: 3 });
  await admin.pedir(`/lessons/${leccion.cuerpo?.id}/cards`, {
    method: 'PUT',
    body: JSON.stringify({ cards: [{ payload: { cardType: 'TEXT_IMAGE', title: nombre, body: 'Contenido del recorrido.' } }] }),
  });
  await admin.post(`/activities/versions/${versionId}/contents`, {
    type: 'LESSON', title: `Contenido ${nombre}`, isRequired: true, config: { minSeconds: 1 }, lessonId: leccion.cuerpo?.id,
  });
  const publicada = await admin.post(`/activities/versions/${versionId}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
  if (!publicada.ok) { mal(`publicar ${nombre}: ${publicada.estado} ${JSON.stringify(publicada.cuerpo).slice(0, 200)}`); return null; }
  const convocatorias = ((await admin.get(`/offerings?activityId=${activityId}`)).cuerpo?.items ?? []).filter((o) => o.status === 'PUBLISHED');
  for (const regla of (await admin.get(`/activities/${activityId}/requirements`)).cuerpo ?? []) reglasCreadas.push({ activityId, ruleId: regla.id });
  return { nombre, activityId, horas, offeringId: convocatorias[0]?.id ?? null };
}

async function crearPrograma(nombre, modulos) {
  const programa = await admin.post('/programas', { code: `PIR_${nombre.toUpperCase()}_${SUFIJO}`, name: `Programa de ${nombre} ${SUFIJO}` });
  if (!programa.ok) { mal(`programa ${nombre}: ${programa.estado} ${JSON.stringify(programa.cuerpo).slice(0, 200)}`); return null; }
  for (const m of modulos) await admin.post(`/programas/${programa.cuerpo.id}/modulos`, { activityId: m.activityId, isRequired: true });
  const publicar = await admin.post(`/programas/${programa.cuerpo.id}/publicar`);
  comprobar(publicar.ok, `programa de ${nombre} publicado, con ${modulos.length} modulos`, `publicar ${nombre}: ${publicar.estado} ${JSON.stringify(publicar.cuerpo).slice(0, 200)}`);
  return programa.cuerpo.id;
}

const vivasDe = async (userId, activityId) =>
  ((await admin.get(`/assignments?targetId=${activityId}&userId=${userId}`)).cuerpo?.items ?? []).filter((f) =>
    ['PENDING', 'OVERDUE', 'IN_PROGRESS'].includes(f.status),
  );
const vivaDeModulo = async (userId, activityId) => (await vivasDe(userId, activityId)).length;
const constanciasDe = async (userId) => (await admin.get(`/certificates?userId=${userId}`)).cuerpo ?? [];

/** El aprendiz cursa un modulo entero: se inscribe y ve la leccion. */
async function cursar(aprendiz, modulo) {
  const inscripcion = await aprendiz.post('/me/enroll', { offeringId: modulo.offeringId });
  if (!inscripcion.ok) { mal(`inscribir ${modulo.nombre}: ${inscripcion.estado} ${JSON.stringify(inscripcion.cuerpo).slice(0, 200)}`); return; }
  const enrollmentId = inscripcion.cuerpo?.enrollmentId ?? inscripcion.cuerpo?.id;
  const curso = (await aprendiz.get(`/me/enrollments/${enrollmentId}`)).cuerpo;
  const piezas = curso?.contents ?? curso?.version?.contents ?? [];
  const laLeccion = piezas.find((c) => c.type === 'LESSON');
  const avance = await aprendiz.post(`/me/contents/${laLeccion?.id}/progress`, { pct: 100, secondsSpent: 60, source: 'DECLARED' });
  comprobar(avance.ok, `${modulo.nombre}: ve la leccion entera`, `${modulo.nombre} avance: ${avance.estado} ${JSON.stringify(avance.cuerpo).slice(0, 200)}`);
}

try {
  // ═════════════════════════ PROGRAMA DE INDUCCION ═════════════════════════
  paso(3, 'PROGRAMA DE INDUCCION: dos modulos que se exigen solos a quien ingresa');
  const I1 = await crearModulo(tipoInd.cuerpo.id, 'Induccion SST', 2);
  const I2 = await crearModulo(tipoInd.cuerpo.id, 'Induccion Calidad', 3);
  if (!I1 || !I2) throw new Error('no se pudieron crear los modulos de induccion');
  const progInd = await crearPrograma('induccion', [I1, I2]);

  paso(4, 'QUIEN INGRESA DESPUES la recibe sola; la antigua, no');
  const altaNueva = await admin.post('/users', {
    documentNumber: `82${marca}`, fullName: `Nueva de programa ${SUFIJO}`, jobTitleId: cargo.id, areaId: area.id, hiredAt: fecha({}),
  });
  const nueva = { id: altaNueva.cuerpo?.user?.id, documento: `82${marca}`, clave: altaNueva.cuerpo?.generatedPassword };
  comprobar(altaNueva.ok && !!nueva.id, 'persona nueva creada, con ingreso hoy', `alta: ${altaNueva.estado}`);
  for (const m of [I1, I2]) {
    comprobar((await vivasDe(nueva.id, m.activityId)).length === 1, `a la nueva le nace sola «${m.nombre}»`, `${m.nombre}: no le nacio`);
    comprobar((await vivasDe(antigua.id, m.activityId)).length === 0, `a la antigua no: «${m.nombre}» es de ingreso`, `${m.nombre}: le nacio a la antigua`);
  }

  paso(5, 'EL PROGRAMA A UNA PERSONA CONCRETA: la antigua lo recibe a mano, entero');
  const aMano = await admin.post(`/programas/${progInd}/asignar-personas`, { userIds: [antigua.id] });
  comprobar(
    aMano.ok && aMano.cuerpo?.modulos === 2 && aMano.cuerpo?.obligacionesCreadas === 2,
    'dos obligaciones, una por modulo',
    `a mano: ${aMano.estado} ${JSON.stringify(aMano.cuerpo).slice(0, 200)}`,
  );
  const repetido = await admin.post(`/programas/${progInd}/asignar-personas`, { userIds: [antigua.id] });
  comprobar(
    repetido.cuerpo?.obligacionesCreadas === 0 && repetido.cuerpo?.yaLaTenian === 2,
    'y asignarlo otra vez no duplica nada',
    `repetido: ${JSON.stringify(repetido.cuerpo).slice(0, 200)}`,
  );

  paso(6, 'LA NUEVA LO CURSA: una sola constancia, la del PROGRAMA, y sin vencimiento');
  const aprendizNueva = crearCliente();
  await aprendizNueva.entrar(nueva.documento, nueva.clave);
  await cursar(aprendizNueva, I1);
  comprobar((await constanciasDe(nueva.id)).length === 0, 'con un modulo de dos, todavia no hay constancia', 'emitio constancia con un modulo pendiente');
  await cursar(aprendizNueva, I2);
  const deLaNueva = await constanciasDe(nueva.id);
  comprobar(deLaNueva.length === 1 && deLaNueva[0]?.typeName === 'Programa', 'nace UNA constancia, la del programa', `tiene ${deLaNueva.length}: ${deLaNueva.map((c) => c.typeName).join(', ')}`);
  comprobar(deLaNueva[0]?.hours === 5, 'con la suma de las horas (5 h)', `dice ${deLaNueva[0]?.hours} h`);
  comprobar(!deLaNueva[0]?.validUntil, 'y no vence: una induccion acredita para siempre', `vence el ${deLaNueva[0]?.validUntil}`);

  // ═════════════════════════ PROGRAMA DE REINDUCCION ═════════════════════════
  paso(7, 'PROGRAMA DE REINDUCCION: dos modulos que vuelven cada 12 meses desde el ingreso');
  const R1 = await crearModulo(tipoRein.cuerpo.id, 'Reinduccion SST', 2);
  const R2 = await crearModulo(tipoRein.cuerpo.id, 'Reinduccion Calidad', 2);
  if (!R1 || !R2) throw new Error('no se pudieron crear los modulos de reinduccion');
  const progRein = await crearPrograma('reinduccion', [R1, R2]);
  const aniversario = masMeses(ingresoAntigua, 12);

  paso(8, 'LE APARECE A QUIEN LE TOCA: a la antigua si, a la que ingreso hoy no');
  for (const m of [R1, R2]) {
    const suyas = await vivasDe(antigua.id, m.activityId);
    comprobar(
      suyas.length === 1 && diaCivil(suyas[0].dueAt) === aniversario,
      `antigua: «${m.nombre}» vence en su aniversario (${aniversario})`,
      `${m.nombre}: ${suyas.length} obligaciones, vence ${suyas[0] ? diaCivil(suyas[0].dueAt) : '-'}`,
    );
    comprobar((await vivasDe(nueva.id, m.activityId)).length === 0, `nueva: «${m.nombre}» no le nace hasta sus 12 meses`, `${m.nombre}: le nacio a quien ingreso hoy`);
  }

  paso(9, 'LA ANTIGUA LO CURSA: la constancia del programa vale hasta su aniversario SIGUIENTE');
  const aprendizAntigua = crearCliente();
  await aprendizAntigua.entrar(antigua.documento, antigua.clave);
  await cursar(aprendizAntigua, R1);
  await cursar(aprendizAntigua, R2);
  const deLaAntigua = (await constanciasDe(antigua.id)).filter((c) => c.typeName === 'Programa');
  comprobar(deLaAntigua.length === 1, 'una constancia de programa (la induccion a mano sigue pendiente)', `tiene ${deLaAntigua.length}`);
  const esperado = masMeses(ingresoAntigua, 24);
  comprobar(
    !!deLaAntigua[0]?.validUntil && diaCivil(deLaAntigua[0].validUntil) === esperado,
    `vigente hasta el ${esperado}: el aniversario siguiente, no 12 meses desde hoy`,
    `vigente hasta ${deLaAntigua[0]?.validUntil ? diaCivil(deLaAntigua[0].validUntil) : '(sin fecha)'} y se esperaba ${esperado}`,
  );
  for (const m of [R1, R2]) {
    comprobar((await vivasDe(antigua.id, m.activityId)).length === 0, `«${m.nombre}» queda cumplida y la siguiente no nace aun`, `${m.nombre}: tiene otra viva`);
  }
  // ═════════════════════════ CONTANDO DESDE LA INDUCCION ═════════════════════════
  paso('9 bis', 'REINDUCCION «DESDE QUE TERMINO SU INDUCCION»: manda la induccion, no el ingreso');
  /*
    La antigua ingreso hace casi un año —por ingreso, la reinduccion le toca en 40 dias— pero su
    induccion la termina HOY (se le dio el programa a mano en el paso 5). Contando desde la induccion,
    sus 12 meses empiezan hoy: no debe nacerle nada. Es lo que distingue los dos modos.
  */
  await cursar(aprendizAntigua, I1);
  await cursar(aprendizAntigua, I2);
  const tipoReinInd = await admin.post('/catalogs/activity-types', {
    code: `E2E_PRI_${marca}`, name: `Reinduccion desde induccion ${SUFIJO}`,
    config: {
      ...comun, requiresBeforeHire: false, defaultRecurrenceMonths: 12, defaultRecurrenceAnchor: 'INDUCTION',
      defaultWindowDays: ANTELACION, defaultOnExpiry: 'CIERRA',
    },
  });
  comprobar(tipoReinInd.ok, 'tipo «desde la induccion» creado', `tipo: ${tipoReinInd.estado} ${JSON.stringify(tipoReinInd.cuerpo).slice(0, 200)}`);
  if (tipoReinInd.ok) {
    tiposCreados.push(tipoReinInd.cuerpo.id);
    const R3 = await crearModulo(tipoReinInd.cuerpo.id, 'Reinduccion tras induccion', 1);
    const reglaR3 = ((await admin.get(`/activities/${R3.activityId}/requirements`)).cuerpo ?? [])[0];
    comprobar(reglaR3?.recurrenceAnchor === 'INDUCTION', 'la regla cuenta desde la INDUCCION', `ancla=${reglaR3?.recurrenceAnchor}`);
    comprobar(
      (await vivaDeModulo(antigua.id, R3.activityId)) === 0,
      'a la antigua no le nace: termino su induccion hoy, y sus 12 meses empiezan a contar ahi',
      'le nacio, como si se contara desde su ingreso',
    );
  }
  ok(`programas: induccion=${progInd} reinduccion=${progRein}`);
} catch (error) {
  mal(`el recorrido se corto: ${error.message}`);
} finally {
  paso(10, 'LIMPIEZA');
  for (const { activityId, ruleId } of reglasCreadas) await admin.pedir(`/activities/${activityId}/requirements/${ruleId}`, { method: 'DELETE' });
  for (const id of tiposCreados) await admin.patch(`/catalogs/activity-types/${id}`, { active: false });
  console.log(`CREADO PARA LIMPIAR: sufijo=${SUFIJO}`);
}

process.exit(resumen() === 0 ? 0 : 1);
