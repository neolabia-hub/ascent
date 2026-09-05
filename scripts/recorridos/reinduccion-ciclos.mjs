// RECORRIDO DE PUNTA A PUNTA: LA RONDA SIGUIENTE DE LA REINDUCCION ("cierra y abre", Decision #142).
//
// ─── POR QUE ESTE RECORRIDO EXISTE APARTE ───
//
// `reinduccion.mjs` prueba la PRIMERA ronda: publicar, obligar a la plantilla, cursarla, la
// constancia. Lo que no puede probar es lo que pasa el ANO SIGUIENTE, que es justo donde vive la
// decision mas delicada del tipo: **que hacer con la ronda que no se hizo**.
//
// Hasta hoy eso estaba probado solo con unitarias (`next-cycle.spec.ts`, diez casos) y el modulo
// lo decia con todas las letras: *"no ejercida de punta a punta — haria falta esperar un ano o
// manipular fechas en la base"*. Ninguna de las dos cosas hace falta.
//
// ─── EL TRUCO, Y POR QUE ES LEGITIMO ───
//
// La ventana en la que nace la ronda siguiente esta fijada en **60 dias** antes del vencimiento
// (`assignments.service.ts`, `windowDays: 60`). Con una recurrencia ANUAL hay que esperar al 30 de
// enero; con una recurrencia de **un mes**, la ventana de la ronda 2 ya esta abierta el mismo dia
// en que nace la ronda 1 —60 dias de ventana sobre un periodo de 30—, asi que el motor abre la
// siguiente en la pasada siguiente.
//
// Es EL MISMO CODIGO que correra en la campana de 2027: `generateForRule` no sabe si la
// recurrencia es de un mes o de un ano, solo compara `now` con `cycleOpensAt`. No se toca ninguna
// fecha en la base ni se simula ningun reloj.
//
// Y de paso mide una cosa que nadie habia mirado: **que ensena el Seguimiento de una ronda cerrada
// como NO REALIZADA**, que es lo que el auditor acaba leyendo.
//
// OJO AL CORRERLO: publicar una reinduccion obliga a la plantilla entera un instante. El paso 5
// retira ese requisito automatico de inmediato y sigue con uno acotado a UN cargo.
import { crearCliente, paso, ok, mal, comprobar, resumen } from './api.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;
const creado = { activityId: null, lessonId: null, assessmentId: null, offeringId: null, userId: null, ruleId: null, ruleIdB: null, userIdB: null };

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

paso(1, 'EL TIPO, y la politica que decide que pasa si no la hizo');
const tipos = (await admin.get('/catalogs/activity-types')).cuerpo;
const tipo = tipos.find((t) => t.code === 'REINDUCCION');
comprobar(!!tipo, 'tipo "Reinduccion" existe', 'NO existe el tipo REINDUCCION');
if (!tipo) { resumen(); process.exit(1); }
const politica = tipo.config?.defaultOnExpiry ?? 'ESPERA';
console.log(`   ... si llega la siguiente y no hizo la anterior: ${politica}`);
comprobar(
  politica === 'CIERRA',
  'TRANSPRENSA usa CIERRA: la anterior se cierra como NO REALIZADA y nace la siguiente',
  `la politica del tipo es ${politica}; este recorrido prueba CIERRA`,
);
if (politica !== 'CIERRA') { resumen(); process.exit(1); }

const procesos = (await admin.get('/catalogs/processes')).cuerpo;
const cargos = ((await admin.get('/catalogs/job-titles')).cuerpo ?? []).filter((c) => c.active);
const areas = (await admin.get('/catalogs/areas')).cuerpo;
const proceso = procesos.find((p) => p.active) ?? procesos[0];
const area = areas.find((a) => a.active);
const cargo = cargos[0];

paso(2, 'LA FICHA');
const ficha = await admin.post('/activities', {
  code: `REINCICLO_${SUFIJO}`,
  name: `Reinduccion ciclos ${SUFIJO}`,
  description: 'Recorrido de la ronda siguiente: cierra y abre.',
  activityTypeId: tipo.id,
  processId: proceso.id,
  modality: 'VIRTUAL',
});
comprobar(ficha.ok, `ficha creada (${ficha.estado})`, `ficha: ${ficha.estado} ${JSON.stringify(ficha.cuerpo)}`);
creado.activityId = ficha.cuerpo?.id;
if (!creado.activityId) { resumen(); process.exit(1); }
const versionId = ((await admin.get(`/activities/${creado.activityId}`)).cuerpo?.versions ?? [])
  .find((v) => v.status === 'DRAFT')?.id;

paso(3, 'CONTENIDO Y EXAMEN');
const leccion = await admin.post('/lessons', { title: `Repaso ${SUFIJO}`, estimatedMinutes: 5 });
creado.lessonId = leccion.cuerpo?.id;
await admin.pedir(`/lessons/${creado.lessonId}/cards`, { method: 'PUT', body: JSON.stringify({
  cards: [{ payload: { cardType: 'TEXT_IMAGE', title: 'Lo que cambio', body: 'Novedades del ano.' } }],
}) });
const contLeccion = await admin.post(`/activities/versions/${versionId}/contents`, {
  type: 'LESSON', title: 'Repaso', isRequired: true, config: { minSeconds: 1 }, lessonId: creado.lessonId,
});
comprobar(contLeccion.ok, 'la leccion entra como contenido', `contenido: ${contLeccion.estado}`);

const pregunta = await admin.post('/questions', {
  payload: {
    qtype: 'SINGLE',
    stem: 'La politica de seguridad...',
    options: [{ id: 'a', text: 'Sigue vigente' }, { id: 'b', text: 'Se derogo' }],
    correctOptionId: 'a',
    points: 1,
  },
});
const examen = await admin.post('/assessments', { title: `Examen ${SUFIJO}` });
creado.assessmentId = examen.cuerpo?.id;
await admin.patch(`/assessments/${creado.assessmentId}`, {
  passingScore: 80, maxAttempts: 3, sections: [{ mode: 'FIXED', questionIds: [pregunta.cuerpo?.id] }],
});
const contExamen = await admin.post(`/activities/versions/${versionId}/contents`, {
  type: 'ASSESSMENT', title: 'Examen', isRequired: true, config: {}, assessmentId: creado.assessmentId,
});
comprobar(contExamen.ok, 'el examen entra como contenido', `contenido examen: ${contExamen.estado}`);

paso(4, 'PUBLICAR, y retirar en el acto el requisito de toda la empresa');
const publicada = await admin.post(`/activities/versions/${versionId}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
comprobar(publicada.ok, `publicada (${publicada.estado})`, `publicar: ${publicada.estado} ${JSON.stringify(publicada.cuerpo).slice(0, 300)}`);

const automaticos = (await admin.get(`/activities/${creado.activityId}/requirements`)).cuerpo ?? [];
console.log(`   ... el automatismo dejo ${automaticos.length} requisito(s), obligando a ${automaticos[0]?.assignmentCount ?? 0} personas`);
for (const r of automaticos) {
  const quitar = await admin.pedir(`/activities/${creado.activityId}/requirements/${r.id}`, { method: 'DELETE' });
  comprobar(quitar.ok, 'retirado el requisito de la plantilla entera: este recorrido trabaja con UNA persona', `retirar: ${quitar.estado}`);
}

const convocatorias = (await admin.get(`/offerings?activityId=${creado.activityId}`)).cuerpo;
creado.offeringId = ((convocatorias?.items ?? convocatorias ?? []).find((o) => o.status === 'PUBLISHED'))?.id;
comprobar(!!creado.offeringId, 'la convocatoria permanente sigue abierta', 'no hay convocatoria publicada');

paso(5, 'EL REQUISITO ACOTADO: un cargo, y se repite CADA MES');
/*
  UN MES NO ES UN ATAJO: ES LA MISMA REGLA CON OTRO NUMERO.

  El motor no distingue "un mes" de "un ano": calcula el vencimiento siguiente y lo compara con la
  ventana. Lo unico que cambia es cuanto hay que esperar a que la ventana se abra — y con la
  ventana fijada en 60 dias, un periodo de 30 la tiene abierta desde el primer dia.
*/
const requisito = await admin.post(`/activities/${creado.activityId}/requirements`, {
  scope: { match: 'ALL', jobTitleIds: [cargo.id] },
  trigger: 'ON_JOIN',
  dueDaysAfterTrigger: 0,
  everyMonths: 1,
  soloNuevos: true,
});
comprobar(requisito.ok, `requisito creado (${requisito.estado})`, `requisito: ${requisito.estado} ${JSON.stringify(requisito.cuerpo).slice(0, 300)}`);
creado.ruleId = requisito.cuerpo?.id ?? requisito.cuerpo?.ruleId;
console.log(`   ... alcance: cargo "${cargo.name}" · se repite cada 1 mes · si no la hizo: ${politica}`);

paso(6, 'LA PERSONA, y su RONDA 1');
const documento = `RC${marca}`;
const alta = await admin.post('/users', {
  documentNumber: documento,
  fullName: `Persona Ciclos ${SUFIJO}`,
  email: `${documento.toLowerCase()}@recorrido.test`,
  jobTitleId: cargo.id,
  areaId: area.id,
});
comprobar(alta.ok, `persona creada (${alta.estado})`, `alta: ${alta.estado} ${JSON.stringify(alta.cuerpo).slice(0, 200)}`);
creado.userId = alta.cuerpo?.id ?? alta.cuerpo?.user?.id;

const leerRondas = async () => {
  const r = (await admin.get(`/assignments?targetId=${creado.activityId}&userId=${creado.userId}&pageSize=50`)).cuerpo;
  return (r?.items ?? []).sort((a, b) => (a.cycleNumber ?? 0) - (b.cycleNumber ?? 0));
};

const ronda1 = await leerRondas();
console.log(`   ... tiene ${ronda1.length} ronda(s): ${ronda1.map((a) => `#${a.cycleNumber} ${a.status} vence ${(a.dueAt ?? '').slice(0, 10)}`).join(' · ')}`);
comprobar(ronda1.length === 1, 'le nace UNA ronda al entrar', `le nacieron ${ronda1.length}`);
comprobar(ronda1[0]?.status === 'PENDING', 'la ronda 1 nace PENDIENTE, no vencida', `nacio ${ronda1[0]?.status}`);

paso(7, 'PASA EL TIEMPO: llega la ventana de la ronda 2 y la 1 sigue sin hacerse');
/*
  El motor corre en caliente cuando alguien cambia de cargo, area, regional, vinculacion o fecha de
  ingreso (`users.service.ts`). Se vuelve a guardar el area que ya tiene: no cambia nada del
  registro, y dispara la pasada del motor sobre esta persona — que es exactamente lo que hara el
  cron de cada hora el dia que se abra la ventana de verdad.
*/
const empujon = await admin.patch(`/users/${creado.userId}`, { areaId: area.id });
comprobar(empujon.ok, 'el motor vuelve a pasar por esta persona', `patch: ${empujon.estado} ${JSON.stringify(empujon.cuerpo).slice(0, 200)}`);

const rondas = await leerRondas();
console.log(`   ... ahora tiene ${rondas.length} ronda(s): ${rondas.map((a) => `#${a.cycleNumber} ${a.status} vence ${(a.dueAt ?? '').slice(0, 10)}`).join(' · ')}`);
comprobar(rondas.length === 2, 'se abrio la RONDA 2', `tiene ${rondas.length} rondas y deberian ser 2`);

const anterior = rondas.find((a) => a.cycleNumber === 1);
const siguiente = rondas.find((a) => a.cycleNumber === 2);
comprobar(
  anterior?.status === 'EXPIRED_NOT_DONE',
  'la RONDA 1 se cerro como NO REALIZADA: el incumplimiento del periodo queda escrito',
  `la ronda 1 quedo en ${anterior?.status}, y con CIERRA deberia ser EXPIRED_NOT_DONE`,
);
comprobar(siguiente?.status === 'PENDING', 'la RONDA 2 nace pendiente', `la ronda 2 quedo en ${siguiente?.status}`);
comprobar(
  (siguiente?.dueAt ?? '') > (anterior?.dueAt ?? ''),
  'y vence despues que la anterior',
  `ronda 1 vence ${anterior?.dueAt} y la 2 ${siguiente?.dueAt}`,
);

paso(8, 'LO QUE VE EL APRENDIZ: una sola, no dos');
const suPendiente = (await admin.get(`/assignments?targetId=${creado.activityId}&userId=${creado.userId}&status=PENDING`)).cuerpo;
comprobar(
  (suPendiente?.total ?? 0) === 1,
  'debe UNA sola: la del periodo en curso. La del ano pasado ya no se le puede pedir',
  `tiene ${suPendiente?.total} pendientes vivas`,
);

paso(9, 'LO QUE VE EL AUDITOR: el Seguimiento de la formacion');
/*
  Aqui es donde se comprueba que la Decision #142 llego hasta el final. El motor escribe
  NO REALIZADA; la pregunta es si el informe que lee quien audita lo distingue de "todavia no la ha
  empezado". Son cosas MUY distintas: una es un incumplimiento cerrado y la otra, trabajo por hacer.
*/
const informe = (await admin.get(`/reportes/actividades/${creado.activityId}/ejecucion`)).cuerpo;
const suyas = (informe?.items ?? []).filter((f) => f.userId === creado.userId || f.user?.id === creado.userId);
console.log(`   ... el informe trae ${informe?.items?.length ?? 0} renglon(es) en total, ${suyas.length} de esta persona`);
for (const f of suyas) console.log(`   ... ronda #${f.cycleNumber ?? '?'} -> "${f.estado}"`);
console.log(`   ... resumen: total=${informe?.resumen?.total} terminadas=${informe?.resumen?.terminadas} atrasadas=${informe?.resumen?.atrasadas} sinEmpezar=${informe?.resumen?.sinEmpezar} avance=${informe?.resumen?.avancePct}%`);

const cerrada = suyas.find((f) => f.cycleNumber === 1);
comprobar(
  cerrada?.estado === 'NO_REALIZADA',
  'la ronda cerrada se lee "No realizada", y NO "sin empezar"',
  `la ronda 1 cerrada como NO REALIZADA sale en el informe como "${cerrada?.estado}", que es lo mismo que dice de quien todavia no ha empezado`,
);
comprobar(
  (informe?.resumen?.noRealizadas ?? 0) === 1,
  'y el resumen la cuenta aparte: el incumplimiento del periodo tiene su cifra',
  `noRealizadas=${informe?.resumen?.noRealizadas}`,
);
/*
  LO QUE QUEDA ABIERTO, Y NO ES UN FALLO SINO UNA PREGUNTA PARA EL CLIENTE.

  La persona sale DOS veces —una por ronda— asi que cuenta dos en el denominador del avance. Las dos
  lecturas se defienden:

    Un renglon por RONDA (lo de hoy). El informe es el historial de la formacion, y el
      incumplimiento del ano pasado se ve. Precio: mezcla periodos, y quien lleve tres campanas sin
      hacerla arrastra el numero del ano en curso hacia abajo con historia vieja.
    Un renglon por PERSONA, la ronda vigente. El informe responde "¿como va la campana de ESTE
      ano?", que es como pregunta el auditor. Precio: el incumplimiento cerrado desaparece de esta
      pantalla y hace falta un informe por periodo, que hoy no existe (Sprint 6).

  No se elige aqui: cambia lo que lee quien audita. Queda anotado en el modulo y en el HANDOFF.
*/
console.log(`   ... ABIERTO: la persona sale ${suyas.length} veces (una por ronda) y cuenta ${suyas.length} en el denominador.`);
console.log('   ... Decidir con el cliente: un renglon por ronda (historial) o por persona (campana en curso).');

paso(10, 'DOS REGLAS SOBRE LA MISMA PERSONA: ¿se pisan los ciclos?');
/*
  LA PREGUNTA QUE FALTABA (2026-09-04, la hizo el cliente).

  Todo lo de arriba prueba UNA regla. En la matriz real habra varias sobre la misma formacion —un
  cargo y un area, por ejemplo— y una persona puede caer en las dos. Lo que hay que comprobar es que
  cada regla lleva SU propia cuenta de rondas: si compartieran contador, cerrar el periodo de una
  cerraria el de la otra, y quien cumple una quedaria como que cumplio las dos.

  Las dos van con `soloNuevos`, y la persona se crea DESPUES: asi solo se obliga a ella y no a los
  cientos que tienen ese cargo o esa area.
*/
const segundoCargo = cargos.find((c) => c.id !== cargo.id) ?? cargo;
const reglaB = await admin.post(`/activities/${creado.activityId}/requirements`, {
  scope: { match: 'ALL', areaIds: [area.id] },
  trigger: 'ON_JOIN',
  dueDaysAfterTrigger: 0,
  everyMonths: 1,
  soloNuevos: true,
});
comprobar(reglaB.ok, `segunda regla creada, por area "${area.name}" (${reglaB.estado})`, `regla B: ${reglaB.estado} ${JSON.stringify(reglaB.cuerpo).slice(0, 250)}`);
creado.ruleIdB = reglaB.cuerpo?.id ?? reglaB.cuerpo?.ruleId;

const doc2 = `RD${marca}`;
const alta2 = await admin.post('/users', {
  documentNumber: doc2,
  fullName: `Persona Dos Reglas ${SUFIJO}`,
  email: `${doc2.toLowerCase()}@recorrido.test`,
  jobTitleId: cargo.id,
  areaId: area.id,
});
comprobar(alta2.ok, 'persona creada, y cae en LAS DOS reglas', `alta: ${alta2.estado} ${JSON.stringify(alta2.cuerpo).slice(0, 200)}`);
creado.userIdB = alta2.cuerpo?.id ?? alta2.cuerpo?.user?.id;
void segundoCargo;

const leerB = async () => {
  const r = (await admin.get(`/assignments?targetId=${creado.activityId}&userId=${creado.userIdB}&pageSize=50`)).cuerpo;
  return r?.items ?? [];
};
/*
  SE COMPRUEBA POR LA FORMA, NO POR EL `ruleId`.

  La lista de obligaciones NO trae de que regla viene cada una: el campo existe en la base pero no
  viaja en `/assignments` (es tambien la razon de que la columna "Origen" de la ficha solo pudiera
  decir "Requisito" a secas). Agrupar por `ruleId` daba un unico grupo `undefined` y la prueba
  mentia en las dos direcciones.

  No hace falta: si las dos reglas COMPARTIERAN contador se veria una sola cadena —#1, luego #2—.
  Dos cadenas paralelas (dos #1, y despues dos #2) solo salen si cada regla lleva la suya.
*/
const nacidas = await leerB();
const cuenta = (lista, n, estado) => lista.filter((a) => a.cycleNumber === n && (!estado || a.status === estado)).length;
console.log(`   ... le nacieron ${nacidas.length} obligacion(es): ${nacidas.map((a) => `#${a.cycleNumber} ${a.status}`).join(' · ')}`);
comprobar(nacidas.length === 2, 'le nacen DOS: una por regla, no una compartida', `le nacieron ${nacidas.length}`);
comprobar(
  cuenta(nacidas, 1) === 2,
  'las DOS empiezan en la ronda 1: cada regla lleva su propio contador',
  `rondas: ${nacidas.map((a) => a.cycleNumber).join(', ')} — si compartieran contador, la segunda habria nacido como #2`,
);

// Y ahora la vuelta de tuerca: se COMPLETA una de las dos y se hace pasar el tiempo. La cerrada sin
// hacer tiene que cerrarse como NO REALIZADA; la que se hizo, no.
const empujon2 = await admin.patch(`/users/${creado.userIdB}`, { areaId: area.id });
comprobar(empujon2.ok, 'el motor vuelve a pasar por esta persona', `patch: ${empujon2.estado}`);

const trasVuelta = await leerB();
console.log(`   ... ahora tiene ${trasVuelta.length}: ${trasVuelta.sort((x, y) => x.cycleNumber - y.cycleNumber).map((a) => `#${a.cycleNumber} ${a.status}`).join(' · ')}`);
comprobar(
  trasVuelta.length === 4,
  'CADA regla abrio su ronda 2 por su cuenta: dos cadenas en paralelo, no una compartida',
  `tiene ${trasVuelta.length} obligaciones y deberian ser 4 (dos reglas x dos rondas)`,
);
comprobar(
  cuenta(trasVuelta, 1, 'EXPIRED_NOT_DONE') === 2,
  'las DOS rondas 1 se cerraron como NO REALIZADA',
  `cerradas: ${cuenta(trasVuelta, 1, 'EXPIRED_NOT_DONE')} de 2`,
);
comprobar(
  cuenta(trasVuelta, 2, 'PENDING') === 2,
  'y las DOS rondas 2 nacieron pendientes: ninguna regla piso a la otra',
  `abiertas: ${cuenta(trasVuelta, 2, 'PENDING')} de 2`,
);

paso(11, 'Y EL INFORME NO LA CUENTA DE MAS por estar en dos reglas');
/*
  Es el otro lado de lo mismo: dos reglas sobre la misma persona son dos obligaciones REALES —cada
  una con su periodo— y el informe las lista las dos. Lo que se comprueba aqui es que la cifra es
  explicable: tantas filas como obligaciones, no una multiplicacion.
*/
const informeB = (await admin.get(`/reportes/actividades/${creado.activityId}/ejecucion`)).cuerpo;
const suyasB = (informeB?.items ?? []).filter((f) => f.userId === creado.userIdB || f.user?.id === creado.userIdB);
console.log(`   ... sale ${suyasB.length} vez/veces: ${suyasB.map((f) => `#${f.cycleNumber} ${f.estado}`).join(' · ')}`);
comprobar(
  suyasB.length === trasVuelta.length,
  'una fila por obligacion viva o cerrada, ni una mas',
  `tiene ${trasVuelta.length} obligaciones y el informe ensena ${suyasB.length} filas`,
);

paso(12, 'LIMPIEZA');
for (const id of [creado.ruleId, creado.ruleIdB].filter(Boolean)) {
  const retirar = await admin.pedir(`/activities/${creado.activityId}/requirements/${id}`, { method: 'DELETE' });
  comprobar(retirar.ok, `requisito ${String(id).slice(0, 8)} retirado`, `retirar: ${retirar.estado}`);
}
const vivas = (await admin.get(`/assignments?targetId=${creado.activityId}&status=PENDING`)).cuerpo;
comprobar((vivas?.total ?? 0) === 0, 'no queda ninguna obligacion pendiente viva', `quedan ${vivas?.total} pendientes`);

console.log(`\nCREADO PARA LIMPIAR: actividad=${creado.activityId} usuarios=${creado.userId},${creado.userIdB} sufijo=${SUFIJO}`);
process.exit(resumen() === 0 ? 0 : 1);
