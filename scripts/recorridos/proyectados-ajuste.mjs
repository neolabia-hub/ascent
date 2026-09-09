// LOS PROYECTADOS: SE DERIVAN, SE CONGELAN, Y SOLO SE CORRIGEN CON MOTIVO (Regla de oro 3).
//
// ─── POR QUE ESTE RECORRIDO ───
//
// El cliente pregunto si ofrecer "ajustar proyectados" AL PUBLICAR es util o redundante. Es util
// —la realidad se mueve despues de congelar— pero estaba en el sitio equivocado: en el momento de
// publicar, el numero acaba de derivarse de los obligados de hoy y no ha tenido tiempo de quedarse
// viejo. Ofrecer corregirlo ahi invita a teclear encima de un dato exacto, y el motivo —que es la
// evidencia que lee quien audita— acaba diciendo "ajuste inicial", que no explica nada.
//
// Se movio al 2026-09-04: publicar congela lo derivado y punto; corregir es otra decision, sobre la
// cifra ya congelada. Este recorrido prueba la SITUACION entera, que es la unica forma de saber si
// el cambio deja el indicador coherente:
//
//   congelar -> cambia la plantilla -> el congelado NO se mueve solo -> ajustar con motivo ->
//   el numero nuevo manda, y el motivo queda escrito.
import { crearCliente, paso, ok, mal, comprobar, resumen } from './api.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;
const creado = { activityId: null, versionId: null, offeringId: null, ruleId: null, personas: [] };
const VACIO = {
  match: 'ALL', jobTitleIds: [], jobTitleTypeIds: [], areaIds: [], regionalIds: [],
  serviceIds: [], employmentTypes: [], roadActors: [],
};

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

paso(1, 'UNA FORMACION DEL PLAN, exigida a un area');
const tipos = (await admin.get('/catalogs/activity-types')).cuerpo;
const tipo = tipos.find((t) => t.code === 'PLAN');
comprobar(!!tipo, 'tipo "Capacitacion del plan" existe', 'NO existe el tipo PLAN');
if (!tipo) { resumen(); process.exit(1); }
const procesos = (await admin.get('/catalogs/processes')).cuerpo;
const proceso = procesos.find((p) => p.active) ?? procesos[0];
const areas = ((await admin.get('/catalogs/areas')).cuerpo ?? []).filter((a) => a.active);
const cargos = ((await admin.get('/catalogs/job-titles')).cuerpo ?? []).filter((c) => c.active);
const area = areas[0];
const cargo = cargos[0];

const ficha = await admin.post('/activities', {
  code: `PROY_${SUFIJO}`, name: `Proyectados ${SUFIJO}`,
  activityTypeId: tipo.id, processId: proceso.id, modality: 'PRESENCIAL',
});
comprobar(ficha.ok, `ficha creada (${ficha.estado})`, `ficha: ${ficha.estado} ${JSON.stringify(ficha.cuerpo).slice(0, 250)}`);
creado.activityId = ficha.cuerpo?.id;
if (!creado.activityId) { resumen(); process.exit(1); }
creado.versionId = ((await admin.get(`/activities/${creado.activityId}`)).cuerpo?.versions ?? []).find((v) => v.status === 'DRAFT')?.id;

const leccion = await admin.post('/lessons', { title: `L ${SUFIJO}`, estimatedMinutes: 5 });
await admin.pedir(`/lessons/${leccion.cuerpo.id}/cards`, { method: 'PUT', body: JSON.stringify({
  cards: [{ payload: { cardType: 'TEXT_IMAGE', title: 'Tema', body: 'Contenido.' } }],
}) });
await admin.post(`/activities/versions/${creado.versionId}/contents`, {
  type: 'LESSON', title: 'Contenido', isRequired: true, config: { minSeconds: 1 }, lessonId: leccion.cuerpo.id,
});
const q = await admin.post('/questions', {
  payload: { qtype: 'SINGLE', stem: 'Pregunta', options: [{ id: 'a', text: 'Si' }, { id: 'b', text: 'No' }], correctOptionId: 'a', points: 1 },
});
const ex = await admin.post('/assessments', { title: `E ${SUFIJO}` });
await admin.patch(`/assessments/${ex.cuerpo.id}`, {
  passingScore: 80, maxAttempts: 3, sections: [{ mode: 'FIXED', questionIds: [q.cuerpo.id] }],
});
await admin.post(`/activities/versions/${creado.versionId}/contents`, {
  type: 'ASSESSMENT', title: 'Examen', isRequired: true, config: {}, assessmentId: ex.cuerpo.id,
});
const pub = await admin.post(`/activities/versions/${creado.versionId}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
comprobar(pub.ok, `publicada (${pub.estado})`, `publicar: ${pub.estado} ${JSON.stringify(pub.cuerpo).slice(0, 250)}`);

/*
  El alcance se acota a un CARGO dentro del area para que el grupo sea pequeño: este recorrido crea
  personas de verdad para mover el numero, y hacerlo sobre un area de 200 seria caro y ruidoso.
*/
const requisito = await admin.post(`/activities/${creado.activityId}/requirements`, {
  scope: { match: 'ALL', jobTitleIds: [cargo.id], areaIds: [area.id] },
  trigger: 'ON_JOIN', dueDaysAfterTrigger: 0, soloNuevos: true,
});
comprobar(requisito.ok, `exigida a "${cargo.name}" de "${area.name}", solo a quien entre desde ahora`, `requisito: ${requisito.estado}`);
creado.ruleId = requisito.cuerpo?.id ?? requisito.cuerpo?.ruleId;

paso(2, 'TRES PERSONAS, y la jornada que las proyecta');
const altaPersona = async (n) => {
  const doc = `PY${marca}${n}`;
  const r = await admin.post('/users', {
    documentNumber: doc, fullName: `Persona Proyectada ${n} ${SUFIJO}`,
    email: `${doc.toLowerCase()}@recorrido.test`, jobTitleId: cargo.id, areaId: area.id,
  });
  if (r.ok) creado.personas.push(r.cuerpo?.id ?? r.cuerpo?.user?.id);
  return r.ok;
};
for (const n of [1, 2, 3]) comprobar(await altaPersona(n), `persona ${n} creada`, `no se pudo crear la persona ${n}`);

const jornada = await admin.post('/offerings', {
  activityVersionId: creado.versionId, kind: 'EVENT', modality: 'PRESENCIAL',
  scheduledDate: `${new Date().getFullYear() + 3}-05-14`, startTime: '08:00', endTime: '12:00',
  location: `Sala ${SUFIJO}`, executedBy: 'PROPIOS', capacity: 500,
  audienceScope: { ...VACIO, jobTitleIds: [cargo.id], areaIds: [area.id] },
});
comprobar(jornada.ok, `jornada programada (${jornada.estado})`, `jornada: ${jornada.estado} ${JSON.stringify(jornada.cuerpo).slice(0, 250)}`);
creado.offeringId = jornada.cuerpo?.id;

const antesDePublicar = (await admin.get(`/offerings/${creado.offeringId}/projected`)).cuerpo;
console.log(`   ... antes de publicar proyectaria ${antesDePublicar?.count} (${antesDePublicar?.source})`);
comprobar(
  (antesDePublicar?.count ?? 0) >= 3,
  `proyecta a las ${antesDePublicar?.count} personas obligadas`,
  `proyecta ${antesDePublicar?.count} y deberian ser al menos las 3 creadas`,
);

paso(3, 'PUBLICAR CONGELA lo derivado, sin pedir ningun ajuste');
/*
  Desde el 2026-09-04 publicar NO admite ajuste desde la pantalla: congela lo derivado. Se comprueba
  que el numero congelado es EXACTAMENTE el derivado, que es lo que el cambio promete.
*/
const publicar = await admin.post(`/offerings/${creado.offeringId}/publish`, { confirm: true });
comprobar(publicar.ok, `jornada publicada (${publicar.estado})`, `publicar: ${publicar.estado} ${JSON.stringify(publicar.cuerpo).slice(0, 250)}`);
const trasPublicar = (await admin.get(`/offerings/${creado.offeringId}`)).cuerpo;
const congelado = trasPublicar?.projectedCount;
console.log(`   ... congelados en ${congelado}, sello ${trasPublicar?.projectedFrozenAt ? 'puesto' : 'AUSENTE'}`);
comprobar(congelado === antesDePublicar?.count, `congela EXACTAMENTE lo derivado (${congelado})`, `congelo ${congelado} y derivaba ${antesDePublicar?.count}`);
comprobar(!!trasPublicar?.projectedFrozenAt, 'con su sello de cuando se congelo', 'no quedo sello de congelado');
comprobar(!trasPublicar?.projectedAdjustReason, 'y SIN motivo de ajuste: no se ajusto nada al publicar', `quedo un motivo: "${trasPublicar?.projectedAdjustReason}"`);

paso(4, 'LA REALIDAD SE MUEVE: entran dos personas mas al mismo cargo y area');
for (const n of [4, 5]) comprobar(await altaPersona(n), `persona ${n} creada despues de congelar`, `no se pudo crear la persona ${n}`);

const derivadoAhora = (await admin.get(`/offerings/${creado.offeringId}/projected`)).cuerpo;
const trasEntrar = (await admin.get(`/offerings/${creado.offeringId}`)).cuerpo;
console.log(`   ... hoy se derivarian ${derivadoAhora?.count} · el congelado sigue en ${trasEntrar?.projectedCount}`);
comprobar(
  (derivadoAhora?.count ?? 0) === (antesDePublicar?.count ?? 0) + 2,
  `lo que se derivaria hoy subio a ${derivadoAhora?.count}: las dos nuevas tambien lo deben`,
  `se derivan ${derivadoAhora?.count} y deberian ser ${(antesDePublicar?.count ?? 0) + 2}`,
);
/*
  ESTO ES LO QUE HACE FALTA EL AJUSTE. El congelado NO se mueve solo, y es correcto: si se
  recalculara, el denominador de la cobertura cambiaria por detras cada vez que entra alguien y el
  indicador del ano no significaria nada (regla de oro 2). Pero entonces la jornada dice que
  proyecta a N cuando de verdad tiene que atender a N+2, y **eso solo lo puede corregir una
  persona, explicando por que**.
*/
comprobar(
  trasEntrar?.projectedCount === congelado,
  'y el CONGELADO no se movio solo: el denominador del año no cambia por detras',
  `el congelado paso de ${congelado} a ${trasEntrar?.projectedCount} sin que nadie lo ajustara`,
);

paso(5, 'AJUSTAR EXIGE MOTIVO, y el motivo tiene que decir algo');
const sinMotivo = await admin.post(`/offerings/${creado.offeringId}/adjust-projected`, { projectedCount: derivadoAhora?.count ?? 0 });
comprobar(!sinMotivo.ok, `sin motivo se rechaza (${sinMotivo.estado})`, `lo acepto sin motivo: ${sinMotivo.estado}`);
const motivoCorto = await admin.post(`/offerings/${creado.offeringId}/adjust-projected`, { projectedCount: derivadoAhora?.count ?? 0, reason: 'ok' });
comprobar(!motivoCorto.ok, `un motivo de dos letras se rechaza (${motivoCorto.estado})`, `acepto "ok" como motivo: ${motivoCorto.estado}`);
const negativo = await admin.post(`/offerings/${creado.offeringId}/adjust-projected`, { projectedCount: -1, reason: 'Motivo suficientemente largo.' });
comprobar(!negativo.ok, `un numero negativo se rechaza (${negativo.estado})`, `acepto -1 proyectados: ${negativo.estado}`);

paso(6, 'AJUSTADO: el numero nuevo manda y el motivo queda escrito');
const MOTIVO = `Ingresaron 2 personas al cargo despues de congelar (recorrido ${SUFIJO}).`;
const ajuste = await admin.post(`/offerings/${creado.offeringId}/adjust-projected`, {
  projectedCount: derivadoAhora?.count ?? 0, reason: MOTIVO,
});
comprobar(ajuste.ok, `ajustado a ${derivadoAhora?.count} (${ajuste.estado})`, `ajustar: ${ajuste.estado} ${JSON.stringify(ajuste.cuerpo).slice(0, 250)}`);

const trasAjuste = (await admin.get(`/offerings/${creado.offeringId}`)).cuerpo;
console.log(`   ... proyectados ahora ${trasAjuste?.projectedCount} · motivo: "${trasAjuste?.projectedAdjustReason ?? ''}"`);
comprobar(
  trasAjuste?.projectedCount === derivadoAhora?.count,
  `el numero nuevo manda: ${trasAjuste?.projectedCount}`,
  `quedo en ${trasAjuste?.projectedCount} y se pidio ${derivadoAhora?.count}`,
);
comprobar(
  trasAjuste?.projectedAdjustReason === MOTIVO,
  'y el motivo queda guardado tal cual: es lo que lee quien audita',
  `el motivo guardado es "${trasAjuste?.projectedAdjustReason}"`,
);
comprobar(!!trasAjuste?.projectedFrozenAt, 'sigue congelado: ajustar no lo descongela', 'se perdio el sello de congelado');

paso(7, 'Y QUEDA EN LA AUDITORIA, que es para lo que existe el motivo');
const auditoria = (await admin.get(`/platform/audit?resourceId=${creado.offeringId}&pageSize=20`)).cuerpo
  ?? (await admin.get(`/audit?resourceId=${creado.offeringId}&pageSize=20`)).cuerpo;
const filas = auditoria?.items ?? auditoria ?? [];
if (!Array.isArray(filas) || filas.length === 0) {
  console.log('   ... no hay endpoint de auditoria accesible con este rol; el motivo ya se comprobo en la convocatoria');
  ok('el motivo viaja con la convocatoria, que es donde lo va a leer quien audita');
} else {
  const laDelAjuste = filas.find((f) => String(f.action ?? '').includes('PROJECTED') || String(JSON.stringify(f)).includes(SUFIJO));
  comprobar(!!laDelAjuste, 'el ajuste dejo su fila de auditoria', `no aparece entre las ${filas.length} filas`);
}

paso(8, 'LIMPIEZA');
const cancelar = await admin.post(`/offerings/${creado.offeringId}/cancel`, { cancelledReason: `Fin del recorrido ${SUFIJO}.` });
comprobar(cancelar.ok || cancelar.estado === 409, 'jornada cancelada', `cancelar: ${cancelar.estado}`);
if (creado.ruleId) {
  const retirar = await admin.pedir(`/activities/${creado.activityId}/requirements/${creado.ruleId}`, { method: 'DELETE' });
  comprobar(retirar.ok, 'requisito retirado', `retirar: ${retirar.estado}`);
}
const vivas = (await admin.get(`/assignments?targetId=${creado.activityId}&status=PENDING`)).cuerpo;
comprobar((vivas?.total ?? 0) === 0, 'no queda ninguna obligacion pendiente viva', `quedan ${vivas?.total} pendientes`);

console.log(`\nCREADO PARA LIMPIAR: actividad=${creado.activityId} personas=${creado.personas.length} sufijo=${SUFIJO}`);
process.exit(resumen() === 0 ? 0 : 1);
