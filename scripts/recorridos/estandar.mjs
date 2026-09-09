// LA SUITE ESTANDAR: cada tipo de formacion cumple LO QUE SU PROPIA CONFIGURACION PROMETE.
//
// ─── POR QUE EXISTE, Y QUE PROBLEMA RESUELVE ───
//
// Habia ocho recorridos escritos a mano, uno por tipo, de 10 a 20 pasos cada uno. Prueban muy bien
// las PECULIARIDADES —el plan y sus renglones, la reinduccion y sus rondas— pero tienen dos
// problemas que crecen con el tiempo:
//
//   1. **Se desincronizan.** Al cambiar algo comun hay que acordarse de tocar ocho archivos, y el
//      que se olvide sigue en verde probando lo de antes.
//   2. **Un tipo nuevo no se prueba solo.** El cliente puede crear "Refuerzo" desde Configuracion,
//      y no habria recorrido que lo mirara.
//
// Esta suite ataca las dos: recorre **todos los tipos que existan en el tenant** —los seis de
// fabrica y los que cree el cliente— y comprueba, de punta a punta, que el sistema hace lo que el
// tipo dice que hace.
//
// ─── LA IDEA: EL CONTRATO ES LA CONFIGURACION ───
//
// No hay una tabla de expectativas escrita aparte, porque una tabla escrita aparte es justo lo que
// se desincroniza. Las expectativas se DERIVAN de `activity_types.config`:
//
//   requiresAssessment    -> el temario lleva examen, y sin el no se puede publicar
//   requiresSurvey        -> el temario lleva encuesta, y va la ULTIMA
//   issuesCertificate     -> al aprobar se emite constancia
//   defaultAssignmentMode -> ON_HIRE obliga solo al publicar; MANUAL/BY_JOB_TITLE no obligan a nadie
//   defaultOfferingKind   -> PERMANENT abre convocatoria sola y es autoservicio; EVENT no
//   participatesInPlan    -> puede o no engancharse a un plan (Decision #78)
//   defaultAnnualDate / defaultRecurrenceMonths -> se repite, o es de una vez
//
// Asi, cambiar la configuracion desde la pantalla cambia lo que se espera, y la prueba sigue siendo
// cierta sin tocarla. Lo que comprueba no es "la induccion general hace X", sino algo mas fuerte:
// **el sistema honra su propia configuracion**.
//
// ─── LO QUE ESTA SUITE NO HACE ───
//
// No sustituye a los recorridos por tipo: aquellos prueban lo que es PROPIO de cada uno —que el
// plan crea su renglon al programar, que la reinduccion cierra la ronda del año, que la especifica
// resuelve el cambio de cargo—. Esta prueba lo COMUN, que es lo que se rompe al cambiar el motor.
//
//   estandar.mjs   ->  todos los tipos, lo comun, derivado de la configuracion
//   <tipo>.mjs     ->  un tipo, lo suyo, escrito a mano
//
// Correrla entera: `node scripts/recorridos/estandar.mjs`
// Un solo tipo:    `node scripts/recorridos/estandar.mjs REINDUCCION`
import { crearCliente, paso, ok, mal, comprobar, resumen } from './api.mjs';
import { comprobarSeguimiento } from './seguimiento.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;
const soloEste = process.argv[2] ?? null;
const creado = [];

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

const tipos = (await admin.get('/catalogs/activity-types')).cuerpo ?? [];
const procesos = (await admin.get('/catalogs/processes')).cuerpo ?? [];
const proceso = procesos.find((p) => p.active) ?? procesos[0];
const cargos = ((await admin.get('/catalogs/job-titles')).cuerpo ?? []).filter((c) => c.active);
const areas = ((await admin.get('/catalogs/areas')).cuerpo ?? []).filter((a) => a.active);
const cargo = cargos[0];
const area = areas[0];

/** Lo que el tipo PROMETE, leido de su configuracion. Ni una expectativa escrita a mano. */
function contratoDe(tipo) {
  const c = tipo.config ?? {};
  return {
    examen: c.requiresAssessment === true,
    encuesta: c.requiresSurvey === true,
    constancia: c.issuesCertificate === true,
    // ON_HIRE es el unico modo que obliga solo al publicar (la general y la reinduccion).
    obligaAlPublicar: c.defaultAssignmentMode === 'ON_HIRE',
    convocatoria: c.defaultOfferingKind ?? 'EVENT',
    permanente: (c.defaultOfferingKind ?? 'EVENT') === 'PERMANENT',
    entraAlPlan: c.participatesInPlan === true,
    seRepite: Boolean(c.defaultAnnualDate || c.defaultRecurrenceMonths),
  };
}

const tiposAProbar = tipos.filter((t) => (soloEste ? t.code === soloEste : true));
comprobar(tiposAProbar.length > 0, `${tiposAProbar.length} tipo(s) a probar`, `no hay ningun tipo${soloEste ? ` con codigo ${soloEste}` : ''}`);
if (tiposAProbar.length === 0) { resumen(); process.exit(1); }

let n = 0;
for (const tipo of tiposAProbar) {
  const contrato = contratoDe(tipo);
  const etiqueta = tipo.name;
  n += 1;
  paso(n, `${etiqueta.toUpperCase()} — lo que promete su configuracion`);
  console.log(
    `   ... examen=${contrato.examen} encuesta=${contrato.encuesta} constancia=${contrato.constancia} · ` +
      `obliga al publicar=${contrato.obligaAlPublicar} · convocatoria=${contrato.convocatoria} · ` +
      `plan=${contrato.entraAlPlan} · se repite=${contrato.seRepite}`,
  );

  // ── La ficha, con el temario que el tipo pide y ni una pieza mas ──────────────────────────────
  const ficha = await admin.post('/activities', {
    code: `STD${n}_${SUFIJO}`,
    name: `Estandar ${etiqueta} ${SUFIJO}`,
    activityTypeId: tipo.id,
    processId: proceso.id,
    modality: contrato.permanente ? 'VIRTUAL' : 'PRESENCIAL',
  });
  if (!ficha.ok) { mal(`${etiqueta}: no se pudo crear la ficha (${ficha.estado}) ${JSON.stringify(ficha.cuerpo).slice(0, 180)}`); continue; }
  const activityId = ficha.cuerpo.id;
  const versionId = ((await admin.get(`/activities/${activityId}`)).cuerpo?.versions ?? []).find((v) => v.status === 'DRAFT')?.id;
  const registro = { activityId, etiqueta, ruleIds: [], offeringIds: [], userId: null };
  creado.push(registro);

  const leccion = await admin.post('/lessons', { title: `L ${n} ${SUFIJO}`, estimatedMinutes: 5 });
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
    const ex = await admin.post('/assessments', { title: `E ${n} ${SUFIJO}` });
    await admin.patch(`/assessments/${ex.cuerpo.id}`, {
      passingScore: 80, maxAttempts: 3, sections: [{ mode: 'FIXED', questionIds: [q.cuerpo.id] }],
    });
    await admin.post(`/activities/versions/${versionId}/contents`, {
      type: 'ASSESSMENT', title: 'Examen', isRequired: true, config: {}, assessmentId: ex.cuerpo.id,
    });
  }

  const publicada = await admin.post(`/activities/versions/${versionId}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
  if (!publicada.ok) { mal(`${etiqueta}: no se pudo publicar (${publicada.estado}) ${JSON.stringify(publicada.cuerpo).slice(0, 200)}`); continue; }

  /*
    ── PUBLICAR SIN LO QUE EL TIPO PIDE SE RECHAZA (Decision #74, cerrada el 2026-09-04) ─────────

    Se prueba sobre una ficha APARTE porque una version publicada ya no se puede modificar.

    Esto fue AVISO hasta hoy, por dos razones escritas en `versioning.service.ts` que dejaron de
    ser ciertas: que el config del tipo no se podia editar desde la interfaz (se edita), y que
    ninguna prueba de punta a punta anadia evaluacion (casi todas la anaden). El propio comentario
    ponia la condicion —"se convierte en compuerta el dia que el config del tipo se edite desde la
    interfaz"— y se cumplio.

    La salida para quien no quiera evaluar un tipo no es un boton de "publicar igualmente": es
    apagar "Se evalúa" en el tipo. Se dice una vez, en su sitio, y vale para todas.
  */
  if (contrato.examen) {
    const suelta = await admin.post('/activities', {
      code: `STDAV${n}_${SUFIJO}`, name: `Aviso ${etiqueta} ${SUFIJO}`,
      activityTypeId: tipo.id, processId: proceso.id, modality: 'VIRTUAL',
    });
    if (suelta.ok) {
      creado.push({ activityId: suelta.cuerpo.id, etiqueta: `${etiqueta} (aviso)`, ruleIds: [], offeringIds: [], userId: null });
      const vSuelta = ((await admin.get(`/activities/${suelta.cuerpo.id}`)).cuerpo?.versions ?? []).find((v) => v.status === 'DRAFT')?.id;
      const l2 = await admin.post('/lessons', { title: `LA ${n} ${SUFIJO}`, estimatedMinutes: 5 });
      await admin.pedir(`/lessons/${l2.cuerpo.id}/cards`, { method: 'PUT', body: JSON.stringify({
        cards: [{ payload: { cardType: 'TEXT_IMAGE', title: 'Tema', body: 'Solo contenido.' } }],
      }) });
      await admin.post(`/activities/versions/${vSuelta}/contents`, {
        type: 'LESSON', title: 'Contenido', isRequired: true, config: { minSeconds: 1 }, lessonId: l2.cuerpo.id,
      });
      const sinExamen = await admin.post(`/activities/versions/${vSuelta}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
      comprobar(
        sinExamen.estado === 409 && sinExamen.cuerpo?.code === 'TYPE_REQUIREMENTS_MISSING',
        `${etiqueta}: publicar sin evaluacion se RECHAZA (409), como pide su tipo`,
        `${etiqueta}: publicar sin evaluacion respondio ${sinExamen.estado} ${sinExamen.cuerpo?.code ?? ''} y el tipo dice que se evalua`,
      );
      // El mensaje explica la CONSECUENCIA, no la regla: es lo que hace que no se discuta.
      if (sinExamen.cuerpo?.title) console.log(`   ... y lo dice asi: "${String(sinExamen.cuerpo.title).slice(0, 85)}..."`);
    }
  }

  // ── Lo que nace SOLO al publicar ──────────────────────────────────────────────────────────────
  const requisitos = (await admin.get(`/activities/${activityId}/requirements`)).cuerpo ?? [];
  registro.ruleIds = requisitos.map((r) => r.id);
  comprobar(
    contrato.obligaAlPublicar ? requisitos.length === 1 : requisitos.length === 0,
    `${etiqueta}: al publicar nacen ${requisitos.length} requisito(s), que es lo que dice \`${tipo.config?.defaultAssignmentMode}\``,
    `${etiqueta}: nacieron ${requisitos.length} requisitos y con \`${tipo.config?.defaultAssignmentMode}\` deberian ser ${contrato.obligaAlPublicar ? 1 : 0}`,
  );

  const convocatorias = (await admin.get(`/offerings?activityId=${activityId}`)).cuerpo;
  const abiertas = (convocatorias?.items ?? convocatorias ?? []);
  registro.offeringIds = abiertas.map((o) => o.id);
  comprobar(
    contrato.permanente ? abiertas.length === 1 : abiertas.length === 0,
    `${etiqueta}: al publicar se abren ${abiertas.length} convocatoria(s), que es lo que dice \`${contrato.convocatoria}\``,
    `${etiqueta}: se abrieron ${abiertas.length} y con \`${contrato.convocatoria}\` deberian ser ${contrato.permanente ? 1 : 0}`,
  );
  if (contrato.permanente && abiertas[0]) {
    comprobar(abiertas[0].kind === 'PERMANENT', `${etiqueta}: y es PERMANENTE`, `${etiqueta}: la convocatoria es ${abiertas[0].kind}`);
  }

  // ── El plan: puede o no engancharse (Decision #78) ────────────────────────────────────────────
  const planes = (await admin.get('/plans')).cuerpo ?? [];
  const enBorrador = (planes.items ?? planes).find((p) => p.status === 'DRAFT');
  if (!enBorrador) {
    console.log(`   ... no hay plan en borrador con el que probar el enganche; se salta`);
  } else {
    let offeringParaElPlan = abiertas[0]?.id;
    if (!offeringParaElPlan) {
      const j = await admin.post('/offerings', {
        activityVersionId: versionId, kind: 'EVENT', modality: 'PRESENCIAL',
        scheduledDate: `${enBorrador.year}-06-14`, startTime: '08:00', endTime: '12:00',
        location: `Sala ${SUFIJO}`, executedBy: 'PROPIOS', capacity: 500,
      });
      if (j.ok) { offeringParaElPlan = j.cuerpo.id; registro.offeringIds.push(j.cuerpo.id); }
    }
    if (offeringParaElPlan) {
      const colar = await admin.post(`/plans/${enBorrador.id}/items`, { offeringId: offeringParaElPlan, plannedMonth: 6 });
      comprobar(
        contrato.entraAlPlan ? colar.ok : colar.estado === 409 && colar.cuerpo?.code === 'ACTIVITY_NOT_PLANNABLE',
        `${etiqueta}: ${contrato.entraAlPlan ? 'SI entra al plan' : 'NO entra al plan (409)'}, como dice \`participatesInPlan\``,
        `${etiqueta}: engancharla al plan dio ${colar.estado} ${colar.cuerpo?.code ?? ''} y \`participatesInPlan\` es ${contrato.entraAlPlan}`,
      );
      if (colar.ok && colar.cuerpo?.id) await admin.pedir(`/plans/items/${colar.cuerpo.id}`, { method: 'DELETE' });
    }
  }

  /*
    ── EL APRENDIZ ───────────────────────────────────────────────────────────────────────────────

    Solo se recorre donde la formacion se puede cursar sin montar media aplicacion: hace falta una
    convocatoria por la que entrar. En los tipos de EVENTO la jornada la programa y convoca una
    persona, y eso ya lo prueban sus recorridos propios; aqui se exige el requisito a mano y se usa
    la convocatoria permanente cuando la hay.
  */
  if (contrato.permanente && abiertas[0]) {
    const doc = `ST${marca}${n}`;
    const alta = await admin.post('/users', {
      documentNumber: doc, fullName: `Aprendiz Estandar ${n} ${SUFIJO}`,
      email: `${doc.toLowerCase()}@recorrido.test`, jobTitleId: cargo.id, areaId: area.id,
    });
    if (!alta.ok) { mal(`${etiqueta}: no se pudo crear el aprendiz (${alta.estado})`); }
    else {
      registro.userId = alta.cuerpo?.id ?? alta.cuerpo?.user?.id;
      const clave = alta.cuerpo?.generatedPassword ?? alta.cuerpo?.password;

      // Si el tipo no obliga solo, se le asigna a mano: sin obligacion no hay nada que cursar.
      if (!contrato.obligaAlPublicar) {
        const asignar = await admin.post('/assignments', { targetId: activityId, userIds: [registro.userId] });
        comprobar(asignar.ok, `${etiqueta}: se le asigna a mano (${asignar.estado})`, `${etiqueta}: asignar: ${asignar.estado}`);
      }

      const aprendiz = crearCliente();
      let entro = false;
      try { await aprendiz.entrar(doc, clave); entro = true; } catch (e) { mal(`${etiqueta}: el aprendiz no pudo entrar: ${e.message}`); }
      if (entro) {
        const inscripcion = await aprendiz.post('/me/enroll', { offeringId: abiertas[0].id });
        comprobar(inscripcion.ok, `${etiqueta}: en una convocatoria PERMANENTE el aprendiz entra solo`, `${etiqueta}: inscribir: ${inscripcion.estado} ${JSON.stringify(inscripcion.cuerpo).slice(0, 160)}`);
        const enrollmentId = inscripcion.cuerpo?.enrollmentId ?? inscripcion.cuerpo?.id;

        if (enrollmentId) {
          const curso = (await aprendiz.get(`/me/enrollments/${enrollmentId}`)).cuerpo;
          const piezas = curso?.contents ?? curso?.version?.contents ?? [];
          const esperadas = 1 + (contrato.examen ? 1 : 0) + (contrato.encuesta ? 1 : 0);
          comprobar(
            piezas.length === esperadas,
            `${etiqueta}: el temario trae las ${esperadas} pieza(s) que el tipo pide (${piezas.map((c) => c.type).join(', ')})`,
            `${etiqueta}: trae ${piezas.length} piezas (${piezas.map((c) => c.type).join(', ')}) y deberian ser ${esperadas}`,
          );
          if (contrato.encuesta) {
            comprobar(
              piezas[piezas.length - 1]?.type === 'SURVEY',
              `${etiqueta}: y la encuesta va la ULTIMA`,
              `${etiqueta}: orden ${piezas.map((c) => c.type).join(', ')} — la encuesta no va al final`,
            );
          }

          const laLeccion = piezas.find((c) => c.type === 'LESSON');
          if (laLeccion) await aprendiz.post(`/me/contents/${laLeccion.id}/progress`, { pct: 100, secondsSpent: 60, source: 'DECLARED' });

          if (contrato.examen) {
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
              comprobar(entrega.cuerpo?.passed === true, `${etiqueta}: aprueba el examen con ${entrega.cuerpo?.score}`, `${etiqueta}: no aprobo: ${JSON.stringify(entrega.cuerpo).slice(0, 160)}`);
            }
          }

          // La constancia: la promesa mas visible del tipo, y la que un auditor va a pedir.
          const lista = (await aprendiz.get('/me/certificados')).cuerpo;
          const items = lista?.items ?? lista ?? [];
          const suya = Array.isArray(items) ? items.find((c) => c.activityName?.includes(SUFIJO) || c.activity?.id === activityId) : null;
          comprobar(
            contrato.constancia ? Boolean(suya) : !suya,
            `${etiqueta}: ${contrato.constancia ? `emite constancia (${suya?.code ?? suya?.verificationCode ?? 'sin codigo'})` : 'NO emite constancia, como promete'}`,
            `${etiqueta}: \`issuesCertificate\` es ${contrato.constancia} y ${suya ? 'hay' : 'no hay'} constancia`,
          );
        }
      }
    }

    // ── Y lo que ve quien audita ────────────────────────────────────────────────────────────────
    await comprobarSeguimiento(admin, activityId, {
      numeroDePaso: n,
      usuarioId: registro.userId,
      estadoEsperado: 'TERMINADA',
    });
  } else {
    console.log(`   ... ${etiqueta} es de EVENTO: la jornada la programa y convoca una persona, y eso lo prueba su recorrido propio`);
  }
}

paso(n + 1, 'LIMPIEZA');
let pendientes = 0;
for (const r of creado) {
  const reqs = (await admin.get(`/activities/${r.activityId}/requirements`)).cuerpo ?? [];
  for (const req of reqs) await admin.pedir(`/activities/${r.activityId}/requirements/${req.id}`, { method: 'DELETE' });
  const v = (await admin.get(`/assignments?targetId=${r.activityId}&status=PENDING`)).cuerpo;
  pendientes += v?.total ?? 0;
}
comprobar(pendientes === 0, 'no queda ninguna obligacion pendiente viva', `quedan ${pendientes} pendientes`);

console.log(`\nCREADO PARA LIMPIAR: ${creado.length} formaciones · sufijo=${SUFIJO}`);
process.exit(resumen() === 0 ? 0 : 1);
