// RECORRIDO DE PUNTA A PUNTA: VARIAS CONVOCATORIAS DE LA MISMA FORMACION.
//
// Los cuatro recorridos por tipo prueban el camino con UNA convocatoria. Este prueba lo que pasa
// cuando hay varias, que es el caso real —dos sedes, dos turnos, una que se cancela y se reprograma—
// y donde estan los daños mas caros, porque son de CONTAR:
//
//   - la obligacion es de la FORMACION, no de la convocatoria: tener dos jornadas no puede crear
//     dos obligaciones a la misma persona;
//   - los PROYECTADOS no pueden sumar dos veces a la misma gente (Decision #68);
//   - y el aprendiz no puede acabar con la misma formacion dos veces en sus pendientes.
//
// Se hace sobre una PERMANENTE (induccion especifica), que es donde no se habia probado: lo de las
// jornadas con fecha ya lo cubre `capacitacion-del-plan.mjs` (dos renglones y la tajada).
import { crearCliente, paso, ok, mal, comprobar, resumen } from './api.mjs';
import { comprobarSeguimiento } from './seguimiento.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;
const VACIO = { match: 'ALL', jobTitleIds: [], jobTitleTypeIds: [], areaIds: [], regionalIds: [], serviceIds: [], employmentTypes: [], roadActors: [] };
const creado = { activityId: null, versionId: null, primera: null, segunda: null, userId: null, userB: null, ruleId: null };

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

paso(1, 'UNA FORMACION PERMANENTE, publicada');
const tipos = (await admin.get('/catalogs/activity-types')).cuerpo;
const tipo = tipos.find((t) => t.code === 'INDUCCION_ESPECIFICA');
const procesos = (await admin.get('/catalogs/processes')).cuerpo;
const areas = (await admin.get('/catalogs/areas')).cuerpo;
const cargos = ((await admin.get('/catalogs/job-titles')).cuerpo ?? []).filter((c) => c.active);
const proceso = procesos.find((p) => p.active) ?? procesos[0];
const area = areas.find((a) => a.active);
let elegido = null;
for (const c of cargos) {
  const n = (await admin.post('/audiences/preview', { ...VACIO, jobTitleIds: [c.id] })).cuerpo?.count ?? 0;
  if (elegido === null || n < elegido.n) elegido = { c, n };
}
console.log(`   ... cargo "${elegido.c.name}" (${elegido.n} personas)`);

const ficha = await admin.post('/activities', {
  code: `VAR_${SUFIJO}`, name: `Varias convocatorias ${SUFIJO}`,
  activityTypeId: tipo.id, processId: proceso.id, modality: 'VIRTUAL',
});
creado.activityId = ficha.cuerpo?.id;
comprobar(ficha.ok, `ficha creada (${ficha.estado})`, `ficha: ${ficha.estado} ${JSON.stringify(ficha.cuerpo).slice(0, 200)}`);
if (!creado.activityId) { resumen(); process.exit(1); }
creado.versionId = ((await admin.get(`/activities/${creado.activityId}`)).cuerpo?.versions ?? []).find((v) => v.status === 'DRAFT')?.id;

const leccion = await admin.post('/lessons', { title: `Contenido ${SUFIJO}`, estimatedMinutes: 5 });
await admin.pedir(`/lessons/${leccion.cuerpo?.id}/cards`, { method: 'PUT', body: JSON.stringify({
  cards: [{ payload: { cardType: 'TEXT_IMAGE', title: 'Unico', body: 'Contenido de la prueba.' } }],
}) });
await admin.post(`/activities/versions/${creado.versionId}/contents`, {
  type: 'LESSON', title: 'Contenido', isRequired: true, config: { minSeconds: 1 }, lessonId: leccion.cuerpo?.id,
});
const pregunta = await admin.post('/questions', {
  payload: { qtype: 'SINGLE', stem: '¿Sirve?', options: [{ id: 'a', text: 'Si' }, { id: 'b', text: 'No' }], correctOptionId: 'a', points: 1 },
});
const examen = await admin.post('/assessments', { title: `Examen ${SUFIJO}` });
await admin.patch(`/assessments/${examen.cuerpo?.id}`, {
  passingScore: 80, maxAttempts: 3, sections: [{ mode: 'FIXED', questionIds: [pregunta.cuerpo?.id] }],
});
await admin.post(`/activities/versions/${creado.versionId}/contents`, {
  type: 'ASSESSMENT', title: 'Examen', isRequired: true, config: {}, assessmentId: examen.cuerpo?.id,
});
const publicada = await admin.post(`/activities/versions/${creado.versionId}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
comprobar(publicada.ok, `publicada (${publicada.estado})`, `publicar: ${publicada.estado}`);

const primeras = ((await admin.get(`/offerings?activityId=${creado.activityId}`)).cuerpo?.items ?? []);
comprobar(primeras.length === 1, 'al publicar se abrio UNA convocatoria sola', `hay ${primeras.length}`);
creado.primera = primeras[0]?.id;
console.log(`   ... la primera es ${primeras[0]?.code} (${primeras[0]?.status})`);

paso(2, 'UNA SEGUNDA CONVOCATORIA para la misma version');
const segunda = await admin.post('/offerings', {
  activityVersionId: creado.versionId, kind: 'PERMANENT', modality: 'VIRTUAL', executedBy: 'PROPIOS',
});
console.log(`   ... crear otra permanente: ${segunda.estado} ${segunda.cuerpo?.code ?? ''}`);
if (segunda.ok) {
  creado.segunda = segunda.cuerpo?.id;
  ok(`se permite: queda ${segunda.cuerpo?.status}. Dos convocatorias vivas para el mismo contenido`);
} else {
  ok(`se rechaza (${segunda.estado} ${segunda.cuerpo?.code ?? ''}): no deja duplicar la convocatoria`);
}

paso(3, 'EXIGIRLA, y comprobar que la obligacion es UNA aunque haya dos convocatorias');
const exigir = await admin.post(`/activities/${creado.activityId}/requirements`, {
  scope: { ...VACIO, jobTitleIds: [elegido.c.id] },
  trigger: 'ON_HIRE', dueDaysAfterTrigger: -1, soloNuevos: false,
});
comprobar(exigir.ok, `exigida al cargo (${exigir.estado})`, `exigir: ${exigir.estado} ${JSON.stringify(exigir.cuerpo).slice(0, 200)}`);
creado.ruleId = exigir.cuerpo?.ruleId;

const documento = `E2E${marca}`;
const alta = await admin.post('/users', {
  documentNumber: documento, fullName: `Persona Varias ${SUFIJO}`,
  email: `${documento.toLowerCase()}@recorrido.test`, jobTitleId: elegido.c.id, areaId: area.id,
});
creado.userId = alta.cuerpo?.id ?? alta.cuerpo?.user?.id;
const clave = alta.cuerpo?.generatedPassword ?? alta.cuerpo?.password;
comprobar(alta.ok, `persona creada (${alta.estado})`, `alta: ${alta.estado}`);

const suyas = (await admin.get(`/assignments?targetId=${creado.activityId}&userId=${creado.userId}`)).cuerpo;
comprobar(
  suyas?.total === 1,
  'tiene UNA sola obligacion: la obligacion es de la FORMACION, no de la convocatoria',
  `tiene ${suyas?.total} obligaciones con dos convocatorias abiertas`,
);

paso(4, 'LOS PROYECTADOS no se suman dos veces');
const proyPrimera = (await admin.get(`/offerings/${creado.primera}/projected`)).cuerpo;
console.log(`   ... la primera proyecta ${proyPrimera?.count}`);
if (creado.segunda) {
  const proySegunda = (await admin.get(`/offerings/${creado.segunda}/projected`)).cuerpo;
  console.log(`   ... la segunda proyecta ${proySegunda?.count}`);
  comprobar(
    proyPrimera?.count === proySegunda?.count,
    'las dos proyectan LO MISMO: sin tajada, cada una atiende a todos los obligados',
    `una proyecta ${proyPrimera?.count} y la otra ${proySegunda?.count}`,
  );
  console.log('   ... OJO: sumarlas seria contar dos veces a la misma gente. Por eso existe la tajada.');
}

paso(5, 'EL APRENDIZ con dos convocatorias delante');
const aprendiz = crearCliente();
let entro = false;
try { await aprendiz.entrar(documento, clave); entro = true; } catch (e) { mal(`no pudo entrar: ${e.message}`); }
let enrollmentId = null;
if (entro) {
  const pendientes = (await aprendiz.get('/me/pending')).cuerpo;
  const mias = (pendientes?.items ?? pendientes ?? []).filter((p) => p.activity?.id === creado.activityId || p.activityId === creado.activityId);
  comprobar(mias.length === 1, 'la ve UNA sola vez en sus pendientes, no una por convocatoria', `le aparece ${mias.length} veces`);

  const ins1 = await aprendiz.post('/me/enroll', { offeringId: creado.primera });
  comprobar(ins1.ok, `se inscribe en la primera (${ins1.estado})`, `inscribir: ${ins1.estado} ${JSON.stringify(ins1.cuerpo).slice(0, 200)}`);
  enrollmentId = ins1.cuerpo?.enrollmentId ?? ins1.cuerpo?.id;

  if (creado.segunda) {
    const ins2 = await aprendiz.post('/me/enroll', { offeringId: creado.segunda });
    console.log(`   ... inscribirse TAMBIEN en la segunda: ${ins2.estado} ${ins2.cuerpo?.code ?? ''}`);
    const id2 = ins2.cuerpo?.enrollmentId ?? ins2.cuerpo?.id;
    comprobar(
      !ins2.ok || id2 === enrollmentId,
      'no acaba con dos inscripciones de la misma formacion: o se rechaza, o le devuelve la que ya tenia',
      `quedo con dos inscripciones distintas (${enrollmentId} y ${id2})`,
    );
  }
}

paso(6, 'TERMINARLA cierra la obligacion, venga por la convocatoria que venga');
if (entro && enrollmentId) {
  const curso = (await aprendiz.get(`/me/enrollments/${enrollmentId}`)).cuerpo;
  const piezas = curso?.contents ?? curso?.version?.contents ?? [];
  const laLeccion = piezas.find((c) => c.type === 'LESSON');
  if (laLeccion) await aprendiz.post(`/me/contents/${laLeccion.id}/progress`, { pct: 100, secondsSpent: 60, source: 'DECLARED' });
  const elExamen = piezas.find((c) => c.type === 'ASSESSMENT');
  const examenId = elExamen?.assessmentId ?? elExamen?.assessment?.id;
  const intento = await aprendiz.post(`/me/enrollments/${enrollmentId}/attempts?assessmentId=${examenId}`, {});
  const attemptId = intento.cuerpo?.id ?? intento.cuerpo?.attempt?.id;
  if (attemptId) {
    const preguntas = intento.cuerpo?.questions ?? (await aprendiz.get(`/me/attempts/${attemptId}`)).cuerpo?.questions ?? [];
    for (const p of preguntas) {
      await aprendiz.post(`/me/attempts/${attemptId}/answers`, { attemptQuestionId: p.attemptQuestionId, answer: { optionId: 'a' } });
    }
    const entrega = await aprendiz.post(`/me/attempts/${attemptId}/submit`, {});
    comprobar(entrega.cuerpo?.passed === true, `aprobada con ${entrega.cuerpo?.score}`, `no aprobo: ${JSON.stringify(entrega.cuerpo).slice(0, 200)}`);
  }

  const trasTerminar = (await admin.get(`/assignments?targetId=${creado.activityId}&userId=${creado.userId}`)).cuerpo;
  const estados = (trasTerminar?.items ?? []).map((a) => a.status);
  console.log(`   ... sus obligaciones: ${estados.join(', ')}`);
  comprobar(
    estados.length === 1 && estados[0] === 'COMPLETED',
    'su UNICA obligacion queda CUMPLIDA: no se queda otra viva por la segunda convocatoria',
    `quedaron ${estados.length}: ${estados.join(', ')}`,
  );

  const pendientesFinal = (await aprendiz.get('/me/pending')).cuerpo;
  const sigue = (pendientesFinal?.items ?? pendientesFinal ?? []).filter((p) => p.activity?.id === creado.activityId || p.activityId === creado.activityId);
  comprobar(sigue.length === 0, 'y le desaparece de pendientes', `le sigue apareciendo ${sigue.length} vez/veces`);
}

paso(7, 'Y SI SE PUBLICAN LAS DOS: el caso de verdad peligroso');
/*
  Hasta aqui la segunda estaba en BORRADOR, y por eso inscribirse en ella daba 409. El estado
  incomodo es el otro: DOS permanentes publicadas para el mismo contenido. Nadie las crea a
  proposito —salen de "creo otra por si acaso" o de un doble clic— y la pregunta es si el aprendiz
  puede acabar con la misma formacion dos veces.
*/
let segundaPublicada = false;
if (creado.segunda) {
  const publicarSegunda = await admin.post(`/offerings/${creado.segunda}/publish`, { confirm: true });
  console.log(`   ... publicar la segunda: ${publicarSegunda.estado} ${publicarSegunda.cuerpo?.code ?? ''}`);
  segundaPublicada = publicarSegunda.ok;
  if (!segundaPublicada) {
    ok('no deja tener dos permanentes publicadas del mismo contenido');
  } else {
    ok('se permite: hay DOS permanentes abiertas para la misma formacion');

    const docB = `E2E${marca}B`;
    const altaB = await admin.post('/users', {
      documentNumber: docB, fullName: `Persona Dos Convocatorias ${SUFIJO}`,
      email: `${docB.toLowerCase()}@recorrido.test`, jobTitleId: elegido.c.id, areaId: area.id,
    });
    creado.userB = altaB.cuerpo?.id ?? altaB.cuerpo?.user?.id;
    const claveB = altaB.cuerpo?.generatedPassword ?? altaB.cuerpo?.password;
    const otro = crearCliente();
    let entroB = false;
    try { await otro.entrar(docB, claveB); entroB = true; } catch (e) { mal(`el segundo no pudo entrar: ${e.message}`); }
    if (entroB) {
      const pB = (await otro.get('/me/pending')).cuerpo;
      const vecesB = (pB?.items ?? pB ?? []).filter((p) => p.activity?.id === creado.activityId || p.activityId === creado.activityId).length;
      comprobar(vecesB === 1, 'con DOS convocatorias abiertas la sigue viendo UNA vez en pendientes', `le aparece ${vecesB} veces`);

      const a = await otro.post('/me/enroll', { offeringId: creado.primera });
      const b = await otro.post('/me/enroll', { offeringId: creado.segunda });
      const idA = a.cuerpo?.enrollmentId ?? a.cuerpo?.id;
      const idB = b.cuerpo?.enrollmentId ?? b.cuerpo?.id;
      console.log(`   ... se inscribe en la primera (${a.estado}) y en la segunda (${b.estado} ${b.cuerpo?.code ?? ''})`);
      comprobar(
        !b.ok || idA === idB,
        'no puede quedarse con DOS inscripciones de la misma formacion',
        `quedo con dos inscripciones distintas: ${idA} y ${idB}. Terminaria una y la otra seguiria viva`,
      );

      const susObligaciones = (await admin.get(`/assignments?targetId=${creado.activityId}&userId=${creado.userB}`)).cuerpo;
      comprobar(
        susObligaciones?.total === 1,
        'y sigue teniendo UNA sola obligacion',
        `tiene ${susObligaciones?.total} obligaciones`,
      );
    }
  }
}

paso(8, 'CANCELAR UNA no debe tumbar la otra');
if (creado.segunda) {
  const cancelar = await admin.post(`/offerings/${creado.segunda}/cancel`, {
    cancelledReason: 'Recorrido automatico: se cancela la segunda para ver que la primera sigue viva.',
  });
  comprobar(cancelar.ok, `segunda cancelada (${cancelar.estado})`, `cancelar: ${cancelar.estado} ${JSON.stringify(cancelar.cuerpo).slice(0, 200)}`);
  const laPrimera = (await admin.get(`/offerings/${creado.primera}`)).cuerpo;
  comprobar(
    laPrimera?.status === 'PUBLISHED' || laPrimera?.status === 'IN_PROGRESS',
    `la primera sigue ${laPrimera?.status}: cancelar una jornada no cierra la formacion`,
    `la primera quedo en ${laPrimera?.status}`,
  );
  const trasCancelar = (await admin.get(`/assignments?targetId=${creado.activityId}&userId=${creado.userId}`)).cuerpo;
  const estadosFinales = (trasCancelar?.items ?? []).map((a) => a.status);
  comprobar(
    estadosFinales.every((e) => e === 'COMPLETED'),
    'y lo que la persona ya cumplio no se toca',
    `sus obligaciones quedaron en: ${estadosFinales.join(', ')}`,
  );
}

await comprobarSeguimiento(admin, creado.activityId, { numeroDePaso: 9, usuarioId: creado.userId, estadoEsperado: 'TERMINADA' });

paso(10, 'LIMPIEZA');
if (creado.ruleId) {
  const retirar = await admin.pedir(`/activities/${creado.activityId}/requirements/${creado.ruleId}`, { method: 'DELETE' });
  comprobar(retirar.ok, 'requisito retirado', `retirar: ${retirar.estado}`);
}

console.log(`\nCREADO PARA LIMPIAR: actividad=${creado.activityId} usuario=${creado.userId} sufijo=${SUFIJO}`);
process.exit(resumen() === 0 ? 0 : 1);
