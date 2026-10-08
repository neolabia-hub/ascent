// RECORRIDO DE PUNTA A PUNTA: LA REINDUCCION AUTOMATICA, POR ANIVERSARIO DE INGRESO (2026-10-06).
//
// Pedido del cliente: "si alguien termino su induccion general, a los 12 meses le pide la
// reinduccion", y "no debe pedirla automatico a todos". La campaña de fecha fija —que sigue
// existiendo como alternativa, ver `reinduccion.mjs`— obliga a la plantilla entera el mismo dia.
//
// Lo que se comprueba aqui, con un tipo PROPIO para no tocar los de la empresa:
//
//   1. Publicar obliga a quien YA CUMPLIO sus 12 meses, y solo a ellos: al resto, cuando los cumpla.
//   2. A quien su aniversario le cae dentro de la antelacion del tipo le nace, y vence ESE dia.
//   3. A quien le cae encima se le dan los DIAS DE GRACIA del tipo (20 aqui, no los 30 de antes).
//   4. Quien ya paso sus 12 meses y tiene el aniversario lejos la recibe YA, con los dias de gracia
//      (decision del cliente del 2026-10-06: «se le debe asignar a todos, no solo los nuevos»).
//   5. A quien ingreso hace poco, o todavia no llega a sus 12 meses, no le nace nada.
//   6. La novedad se resuelve A MANO desde Quienes, y despues la regla no le crea otra.
//   7. La antelacion es la del tipo (45 aqui), no los 60 fijos de antes.
//
// Las rondas siguientes (el aniversario POSTERIOR al periodo cumplido) las cubren las unitarias de
// `due-date.spec.ts`: no se puede adelantar el reloj por HTTP.

import { crearCliente, paso, comprobar, resumen } from './api.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;
const ANTELACION = 45;
const GRACIA = 20;

/** AAAA-MM-DD de hoy en Colombia, movido `meses` y `dias`. */
function fecha({ meses = 0, dias = 0 }) {
  const hoy = new Date(Date.now() - 5 * 60 * 60 * 1000);
  const base = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + meses, hoy.getUTCDate()));
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}
const diaCivil = (instante) => new Date(new Date(instante).getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

paso(1, 'EL TIPO: vuelve cada 12 meses DESDE EL INGRESO, con 45 dias de antelacion');
const tipo = await admin.post('/catalogs/activity-types', {
  code: `E2E_RI_${marca}`,
  name: `Reinduccion por ingreso ${SUFIJO}`,
  config: {
    requiresAssessment: false,
    requiresSurvey: false,
    issuesCertificate: false,
    defaultOfferingKind: 'PERMANENT',
    defaultAssignmentMode: 'ON_HIRE',
    requiresBeforeHire: false,
    defaultRecurrenceMonths: 12,
    defaultRecurrenceAnchor: 'HIRE',
    defaultWindowDays: ANTELACION,
    defaultGraceDays: GRACIA,
    defaultOnExpiry: 'CIERRA',
  },
});
comprobar(tipo.ok, 'tipo creado', `tipo: ${tipo.estado} ${JSON.stringify(tipo.cuerpo)}`);
if (!tipo.ok) { resumen(); process.exit(1); }

const procesos = (await admin.get('/catalogs/processes')).cuerpo;
const cargo = ((await admin.get('/catalogs/job-titles')).cuerpo ?? []).find((c) => c.active);
const area = ((await admin.get('/catalogs/areas')).cuerpo ?? []).find((a) => a.active);
const plantilla = (await admin.post('/audiences/preview', { match: 'ALL', jobTitleIds: [] })).cuerpo?.count ?? 0;

paso(2, 'LAS PERSONAS, cada una con su fecha de ingreso');
// El aniversario de cada una es su ingreso + 12, + 24... El primero en o despues de hoy.
const casos = {
  enVentana: { hiredAt: fecha({ meses: -12, dias: 40 }), aniversario: fecha({ dias: 40 }) },
  antigua: { hiredAt: fecha({ meses: -36, dias: 35 }), aniversario: fecha({ dias: 35 }) },
  encima: { hiredAt: fecha({ meses: -12, dias: 5 }), aniversario: fecha({ dias: 5 }) },
  lejos: { hiredAt: fecha({ meses: -24, dias: 120 }), aniversario: fecha({ dias: 120 }) },
  reciente: { hiredAt: fecha({ meses: -1 }), aniversario: null },
  fueraDeAntelacion: { hiredAt: fecha({ meses: -12, dias: 55 }), aniversario: fecha({ dias: 55 }) },
};
let n = 0;
for (const [nombre, caso] of Object.entries(casos)) {
  n += 1;
  const alta = await admin.post('/users', {
    documentNumber: `7${n}${marca}`,
    fullName: `Ingreso ${nombre} ${SUFIJO}`,
    jobTitleId: cargo.id,
    areaId: area.id,
    hiredAt: caso.hiredAt,
  });
  caso.id = alta.cuerpo?.user?.id;
  comprobar(alta.ok && !!caso.id, `${nombre}: ingreso el ${caso.hiredAt}`, `${nombre}: ${alta.estado} ${JSON.stringify(alta.cuerpo)}`);
}

paso(3, 'LA FORMACION, publicada');
const ficha = await admin.post('/activities', {
  code: `REINI_${SUFIJO}`,
  name: `Reinduccion por ingreso ${SUFIJO}`,
  activityTypeId: tipo.cuerpo.id,
  processId: (procesos.find((p) => p.active) ?? procesos[0]).id,
  modality: 'VIRTUAL',
});
const activityId = ficha.cuerpo?.id;
const versionId = ((await admin.get(`/activities/${activityId}`)).cuerpo?.versions ?? []).find((v) => v.status === 'DRAFT')?.id;
const leccion = await admin.post('/lessons', { title: `Repaso ${SUFIJO}`, estimatedMinutes: 3 });
await admin.pedir(`/lessons/${leccion.cuerpo?.id}/cards`, {
  method: 'PUT',
  body: JSON.stringify({ cards: [{ payload: { cardType: 'TEXT_IMAGE', title: 'Repaso', body: 'Contenido de prueba.' } }] }),
});
await admin.post(`/activities/versions/${versionId}/contents`, {
  type: 'LESSON', title: 'Repaso', isRequired: true, config: { minSeconds: 1 }, lessonId: leccion.cuerpo?.id,
});
const publicar = await admin.post(`/activities/versions/${versionId}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
comprobar(publicar.ok, 'publicada', `publicar: ${publicar.estado} ${JSON.stringify(publicar.cuerpo)}`);

const vivaDe = async (userId) => {
  const pagina = (await admin.get(`/assignments?targetId=${activityId}&userId=${userId}`)).cuerpo;
  return (pagina?.items ?? []).filter((fila) => ['PENDING', 'OVERDUE', 'IN_PROGRESS'].includes(fila.status));
};

let ruleId = null;
try {
  paso(4, 'LA REGLA: nacio sola, anclada al ingreso, y NO obligo a la plantilla');
  const requisitos = (await admin.get(`/activities/${activityId}/requirements`)).cuerpo ?? [];
  const regla = requisitos[0];
  ruleId = regla?.id ?? null;
  comprobar(requisitos.length === 1 && regla?.reachesEveryone === true, 'una regla, de toda la empresa', `reglas: ${JSON.stringify(requisitos)}`);
  comprobar(regla?.recurrenceAnchor === 'HIRE' && regla?.everyMonths === 12, 'cada 12 meses desde el INGRESO', `ancla=${regla?.recurrenceAnchor} meses=${regla?.everyMonths}`);
  comprobar(regla?.windowDays === ANTELACION, `con la antelacion del tipo (${ANTELACION} dias)`, `antelacion=${regla?.windowDays}`);
  console.log(`   ... la empresa son ${plantilla} personas y la regla obligo hoy a ${regla?.assignmentCount}`);
  comprobar(
    regla?.assignmentCount < plantilla,
    'publicar NO obliga a todos: solo a quien ya cumplio sus meses',
    `obligo a ${regla?.assignmentCount} de ${plantilla}`,
  );

  paso(5, 'A QUIEN LE TOCA, le nace con SU fecha');
  for (const nombre of ['enVentana', 'antigua']) {
    const filas = await vivaDe(casos[nombre].id);
    comprobar(
      filas.length === 1 && diaCivil(filas[0].dueAt) === casos[nombre].aniversario,
      `${nombre}: una obligacion, vence en su aniversario (${casos[nombre].aniversario})`,
      `${nombre}: ${filas.length} obligaciones, vence ${filas[0] ? diaCivil(filas[0].dueAt) : '-'} y se esperaba ${casos[nombre].aniversario}`,
    );
  }
  const encima = await vivaDe(casos.encima.id);
  comprobar(
    encima.length === 1 && diaCivil(encima[0].dueAt) === fecha({ dias: GRACIA }),
    `encima: su aniversario es en 5 dias y se le dan los ${GRACIA} de gracia del tipo`,
    `encima: ${encima.length} obligaciones, vence ${encima[0] ? diaCivil(encima[0].dueAt) : '-'}`,
  );

    const lejos = await vivaDe(casos.lejos.id);
  comprobar(
    lejos.length === 1 && diaCivil(lejos[0].dueAt) === fecha({ dias: GRACIA }),
    `lejos: ya paso sus 12 meses y su aniversario es en 120 dias: la recibe YA, con ${GRACIA} dias`,
    `lejos: ${lejos.length} obligaciones, vence ${lejos[0] ? diaCivil(lejos[0].dueAt) : '-'}`,
  );

  paso(6, 'A QUIEN TODAVIA NO CUMPLE SUS 12 MESES, nada');
  for (const nombre of ['reciente', 'fueraDeAntelacion']) {
    const filas = await vivaDe(casos[nombre].id);
    comprobar(filas.length === 0, `${nombre}: no le nace nada`, `${nombre}: le nacieron ${filas.length}`);
  }

  paso(7, 'LA NOVEDAD, A MANO desde Quienes: y la regla no le crea otra');
  const aMano = await admin.post('/assignments', { targetType: 'ACTIVITY', targetId: activityId, userIds: [casos.fueraDeAntelacion.id], dueAt: null });
  comprobar(aMano.ok && aMano.cuerpo?.created === 1, 'asignada a mano a quien todavia no cumple sus 12 meses', `a mano: ${aMano.estado} ${JSON.stringify(aMano.cuerpo)}`);
  // Guardar la regla otra vez dispara una pasada del motor.
  const repaso = await admin.post(`/activities/${activityId}/requirements`, {
    scope: { match: 'ALL' }, trigger: 'ON_JOIN', dueDaysAfterTrigger: 30, everyMonths: 12, fixedDate: null, recurrenceAnchor: 'HIRE',
  });
  comprobar(repaso.ok, 'se ajusta la regla (otra pasada del motor)', `ajuste: ${repaso.estado} ${JSON.stringify(repaso.cuerpo)}`);
  comprobar((await vivaDe(casos.fueraDeAntelacion.id)).length === 1, 'sigue con UNA sola obligacion', 'la regla le creo otra encima de la manual');
  comprobar((await vivaDe(casos.enVentana.id)).length === 1, 'y a quien ya la tenia no se le duplica', 'se duplico tras el ajuste');
  comprobar((await vivaDe(casos.reciente.id)).length === 0, 'el recien ingresado sigue sin nada', 'al recien ingresado le nacio');
} finally {
  paso(8, 'LIMPIEZA');
  if (ruleId) await admin.pedir(`/activities/${activityId}/requirements/${ruleId}`, { method: 'DELETE' });
  await admin.patch(`/catalogs/activity-types/${tipo.cuerpo.id}`, { active: false });
  console.log(`CREADO PARA LIMPIAR: actividad=${activityId} sufijo=${SUFIJO}`);
}

process.exit(resumen() === 0 ? 0 : 1);
