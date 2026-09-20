// RECORRIDO DE PUNTA A PUNTA: EVALUACION DE DESEMPEÑO (2026-09-20).
//
// El modulo tenia pruebas de sus funciones PURAS —`performance-scoring.spec.ts`, 21 casos— y
// ninguna del camino entero. Y el camino entero es donde vive lo que de verdad falla: que abrir un
// ciclo reparta formularios, que a cada quien le toque SU evaluador, que entregar calcule la nota,
// que firmar deje huella, y que el consolidado diga lo mismo que paso.
//
// ─── LO QUE ESTE RECORRIDO EXISTE PARA PROBAR ───
//
// Sobre todo, **la evaluacion por JEFATURAS DE SUB-AREA**, que es para lo que el cliente lo pidio:
//
//     persona.areaId  ->  area.responsibleUserId  =  quien la evalua
//
// Se montan dos sub-areas de la misma area madre, cada una con su jefatura, y se comprueba que
// **cada jefe recibe exactamente a los suyos** y a nadie mas. Sin esto, el reparto de evaluadores
// se puede romper sin que ninguna prueba unitaria lo note: `planificarEvaluaciones` es pura y
// recibe el mapa ya hecho — quien lo construye mal es la consulta, y eso solo se ve aqui.
//
//   node scripts/recorridos/desempeno.mjs      (con el stack arriba: .\scripts\mirar.ps1)
import { crearCliente, paso, ok, mal, comprobar, resumen } from './api.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;
const creado = { areaMadre: null, subAreas: [], userIds: [], cicloId: null };

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

// ───────────────────────────────────────────────────────────────────────────────
paso(1, 'DOS SUB-AREAS DE LA MISMA MADRE, cada una con su jefatura');
const cargos = ((await admin.get('/catalogs/job-titles')).cuerpo ?? []).filter((c) => c.active);
const cargo = cargos[0];
comprobar(!!cargo, `cargo para la prueba: "${cargo?.name}"`, 'no hay cargos activos');
if (!cargo) { resumen(); process.exit(1); }

const crearArea = async (nombre, parentId = null) => {
  const r = await admin.post('/catalogs/areas', {
    // El codigo solo admite mayusculas, numeros y guion bajo: el nombre lleva espacios.
    code: `${SUFIJO}_${nombre}`.toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 30),
    name: `${nombre} ${SUFIJO}`,
    active: true,
    displayOrder: 0,
    ...(parentId ? { parentId } : {}),
  });
  if (!r.ok) { mal(`crear area ${nombre}: ${r.estado} ${JSON.stringify(r.cuerpo).slice(0, 200)}`); return null; }
  return r.cuerpo.id;
};

creado.areaMadre = await crearArea('Gestion Humana');
const areaNomina = await crearArea('Nomina', creado.areaMadre);
const areaSeleccion = await crearArea('Seleccion', creado.areaMadre);
creado.subAreas = [areaNomina, areaSeleccion].filter(Boolean);
comprobar(creado.subAreas.length === 2, 'las dos sub-areas cuelgan de la misma area madre', `salieron ${creado.subAreas.length}`);
if (creado.subAreas.length !== 2) { resumen(); process.exit(1); }

/*
  UN AREA NO PUEDE COLGAR DE SI MISMA. La guarda vive en el SERVIDOR y no en el desplegable, asi
  que se comprueba aqui: filtrar una lista no es un control.
*/
const ciclo = await admin.patch(`/catalogs/areas/${areaNomina}`, { parentId: areaNomina });
comprobar(
  ciclo.estado === 400 && ciclo.cuerpo?.code === 'AREA_PARENT_SELF',
  `un area no puede ser su propia madre (${ciclo.estado} ${ciclo.cuerpo?.code ?? ''})`,
  `lo acepto (${ciclo.estado}), y eso cuelga la lectura del arbol el dia que alguien lo recorra`,
);
const cicloLargo = await admin.patch(`/catalogs/areas/${creado.areaMadre}`, { parentId: areaNomina });
comprobar(
  cicloLargo.estado === 400 && cicloLargo.cuerpo?.code === 'AREA_PARENT_CYCLE',
  `ni colgar de su propia rama (${cicloLargo.estado} ${cicloLargo.cuerpo?.code ?? ''})`,
  `lo acepto (${cicloLargo.estado}): Gestion Humana quedaria colgando de su propia hija`,
);

// ───────────────────────────────────────────────────────────────────────────────
paso(2, 'LA GENTE: dos jefaturas y dos personas, una en cada sub-area');
const crearPersona = async (nombre, areaId, sufijoDoc) => {
  const documento = `7${marca}${sufijoDoc}`;
  const r = await admin.post('/users', {
    documentNumber: documento,
    fullName: `${nombre} ${SUFIJO}`,
    email: `${documento}@recorrido.test`,
    jobTitleId: cargo.id,
    areaId,
  });
  if (!r.ok) { mal(`crear ${nombre}: ${r.estado} ${JSON.stringify(r.cuerpo).slice(0, 200)}`); return null; }
  const id = r.cuerpo?.id ?? r.cuerpo?.user?.id;
  creado.userIds.push(id);
  return { id, documento, clave: r.cuerpo?.generatedPassword ?? r.cuerpo?.password };
};

const jefeNomina = await crearPersona('Jefe Nomina', areaNomina, '1');
const jefeSeleccion = await crearPersona('Jefe Seleccion', areaSeleccion, '2');
const deNomina = await crearPersona('Persona Nomina', areaNomina, '3');
const deSeleccion = await crearPersona('Persona Seleccion', areaSeleccion, '4');
comprobar(creado.userIds.length === 4, 'cuatro personas creadas', `salieron ${creado.userIds.length}`);
if (creado.userIds.length !== 4) { resumen(); process.exit(1); }

for (const [areaId, jefe, nombre] of [[areaNomina, jefeNomina, 'Nomina'], [areaSeleccion, jefeSeleccion, 'Seleccion']]) {
  const r = await admin.patch(`/catalogs/areas/${areaId}`, { responsibleUserId: jefe.id });
  comprobar(r.ok, `${nombre} queda con su jefatura`, `${nombre}: ${r.estado} ${JSON.stringify(r.cuerpo).slice(0, 160)}`);
}

// ───────────────────────────────────────────────────────────────────────────────
paso(3, 'COMPETENCIAS Y FORMULARIO');
const competencia = await admin.post('/desempeno/competencias', {
  code: `COMP_${marca}`,
  name: `Orientacion al servicio ${SUFIJO}`,
  scale: 'ONE_TO_FIVE',
  active: true,
  displayOrder: 0,
});
comprobar(competencia.ok, `competencia creada (${competencia.estado})`, `competencia: ${competencia.estado} ${JSON.stringify(competencia.cuerpo).slice(0, 200)}`);

const formulario = await admin.post('/desempeno/formularios', {
  name: `Formulario ${SUFIJO}`,
  active: true,
  items: [{ competencyId: competencia.cuerpo?.id, weight: 1 }],
  // Sin cargos = aplica a toda la empresa, que es lo que hace falta para que recoja a los cuatro.
  jobTitleIds: [],
});
comprobar(formulario.ok, `formulario creado (${formulario.estado})`, `formulario: ${formulario.estado} ${JSON.stringify(formulario.cuerpo).slice(0, 200)}`);
if (!formulario.ok) { resumen(); process.exit(1); }

// ───────────────────────────────────────────────────────────────────────────────
paso(4, 'ABRIR EL CICLO: aqui se reparten formularios Y EVALUADORES');
const ahora = new Date();
const dentroDeUnMes = new Date(ahora.getTime() + 30 * 86400000);
const nuevoCiclo = await admin.post('/desempeno/ciclos', {
  name: `Ciclo ${SUFIJO}`,
  formIds: [formulario.cuerpo.id],
  startsAt: ahora.toISOString(),
  endsAt: dentroDeUnMes.toISOString(),
  selfEvaluation: true,
  visibleToEmployee: true,
  requiresSignature: true,
});
comprobar(nuevoCiclo.ok, `ciclo creado (${nuevoCiclo.estado})`, `ciclo: ${nuevoCiclo.estado} ${JSON.stringify(nuevoCiclo.cuerpo).slice(0, 250)}`);
creado.cicloId = nuevoCiclo.cuerpo?.id;
if (!creado.cicloId) { resumen(); process.exit(1); }

const abrir = await admin.post(`/desempeno/ciclos/${creado.cicloId}/abrir`);
comprobar(abrir.ok, `ciclo abierto (${abrir.estado})`, `abrir: ${abrir.estado} ${JSON.stringify(abrir.cuerpo).slice(0, 250)}`);
console.log(`   ... ${JSON.stringify(abrir.cuerpo).slice(0, 200)}`);

// ───────────────────────────────────────────────────────────────────────────────
paso(5, 'CADA JEFE RECIBE A LOS SUYOS, Y A NADIE MAS');
/*
  ES LA COMPROBACION QUE JUSTIFICA ESTE ARCHIVO. El cliente lo pidio asi: *"se necesita saber por
  jefaturas, con sub-areas, para que cada jefe de sub-area sepa a quien evaluar, y no un area grande
  que tiene muchas jefaturas"*.

  El evaluador sale de `area.responsibleUserId` del area DE LA PERSONA. Si alguien cambiara esa
  consulta para subir al area madre, los dos jefes recibirian a los cuatro y nadie se enteraria: las
  pruebas unitarias de `planificarEvaluaciones` seguirian verdes, porque reciben el mapa ya hecho.
*/
const evaluacionesDe = async (persona) => {
  const cliente = crearCliente();
  try { await cliente.entrar(persona.documento, persona.clave); } catch (e) { mal(`no entro ${persona.documento}: ${e.message}`); return null; }
  const r = await cliente.get('/desempeno/mis-evaluaciones');
  return { cliente, items: (r.cuerpo?.items ?? r.cuerpo ?? []).filter((e) => e.cycleId === creado.cicloId || e.cycle?.id === creado.cicloId) };
};

const deJefeNomina = await evaluacionesDe(jefeNomina);
const deJefeSeleccion = await evaluacionesDe(jefeSeleccion);
if (!deJefeNomina || !deJefeSeleccion) { resumen(); process.exit(1); }

const evaluadosPor = (paquete) => (paquete.items ?? []).map((e) => e.subjectUserId);
const suyosNomina = evaluadosPor(deJefeNomina);
const suyosSeleccion = evaluadosPor(deJefeSeleccion);
console.log(`   ... jefe de Nomina evalua a ${suyosNomina.length}; jefe de Seleccion a ${suyosSeleccion.length}`);

comprobar(
  suyosNomina.includes(deNomina.id),
  'el jefe de Nomina recibe a la persona de Nomina',
  'no le llego la persona de su propia sub-area',
);
comprobar(
  !suyosNomina.includes(deSeleccion.id),
  'y NO recibe a la de Seleccion: cada jefatura ve solo su sub-area',
  'le llego gente de otra sub-area, que es justo lo que el cliente no quiere',
);
comprobar(
  suyosSeleccion.includes(deSeleccion.id) && !suyosSeleccion.includes(deNomina.id),
  'y al reves con el jefe de Seleccion',
  `recibio ${suyosSeleccion.length} y no son los suyos`,
);

// ───────────────────────────────────────────────────────────────────────────────
paso(6, 'CALIFICAR Y ENTREGAR: la nota se calcula sola');
const laDeNomina = (deJefeNomina.items ?? []).find((e) => (e.subjectUserId) === deNomina.id);
comprobar(!!laDeNomina, 'el jefe tiene abierta la evaluacion de su persona', 'no la encuentra');

let notaEntregada = null;
if (laDeNomina) {
  const detalle = (await deJefeNomina.cliente.get(`/desempeno/${laDeNomina.id}`)).cuerpo;
  /*
    LAS COMPETENCIAS VIENEN DE LA COPIA CONGELADA del ciclo (`cycleForm.formSnapshot`), no del
    formulario vivo: editar el formulario despues de abrir la campaña no puede cambiar lo que ya se
    pregunto. Es la misma idea que congelar la version de una formacion al publicarla.
  */
  const competencias = detalle?.cycleForm?.formSnapshot?.items ?? [];
  console.log(`   ... el formulario congelado trae ${competencias.length} competencia(s)`);
  comprobar(competencias.length >= 1, 'con las competencias del formulario, congeladas en el ciclo', 'llego sin competencias');

  const entrega = await deJefeNomina.cliente.post(`/desempeno/${laDeNomina.id}/entregar`, {
    answers: competencias.map((c) => ({
      competencyId: c.competencyId,
      value: 4,
      comment: 'Recorrido automatico de punta a punta.',
    })),
  });
  comprobar(entrega.ok, `entregada (${entrega.estado})`, `entregar: ${entrega.estado} ${JSON.stringify(entrega.cuerpo).slice(0, 250)}`);
  notaEntregada = entrega.cuerpo?.score ?? entrega.cuerpo?.scorePct ?? null;
  console.log(`   ... nota: ${notaEntregada}`);
  comprobar(notaEntregada !== null, 'y trae su nota calculada, sin que nadie la escriba', 'entrego sin nota');
}

// ───────────────────────────────────────────────────────────────────────────────
paso(7, 'LA PERSONA LA VE Y LA FIRMA');
const suya = await evaluacionesDe(deNomina);
if (suya) {
  const sobreMi = (await suya.cliente.get('/desempeno/sobre-mi')).cuerpo;
  const mia = (sobreMi?.items ?? sobreMi ?? []).find((e) => e.cycleId === creado.cicloId || e.cycle?.id === creado.cicloId);
  comprobar(!!mia, 'la persona ve la evaluacion que le hicieron', `no la ve: ${JSON.stringify(sobreMi).slice(0, 200)}`);

  if (mia) {
    const firma = await suya.cliente.post(`/desempeno/${mia.id}/firmar`);
    comprobar(firma.ok, `firmada (${firma.estado})`, `firmar: ${firma.estado} ${JSON.stringify(firma.cuerpo).slice(0, 250)}`);
    const trasFirmar = (await suya.cliente.get(`/desempeno/${mia.id}`)).cuerpo;
    comprobar(
      !!(trasFirmar?.signedAt ?? trasFirmar?.employeeSignedAt),
      'y queda la huella de la firma, con su fecha',
      'firmo y no quedo rastro, que es lo unico que hace que firmar signifique algo',
    );
  }

  /*
    LA AUTOEVALUACION es otra fila del mismo ciclo, no un campo de la del jefe: por eso se pueden
    comparar lado a lado. Se comprueba que existe cuando el ciclo la pide.
  */
  const propias = (suya.items ?? []).filter((e) => (e.subjectUserId) === deNomina.id);
  comprobar(propias.length >= 1, 'y tiene su AUTOEVALUACION, que es una fila aparte', 'el ciclo pedia autoevaluacion y no le llego');
}

// ───────────────────────────────────────────────────────────────────────────────
paso(8, 'EL CONSOLIDADO dice lo mismo que paso');
const consolidado = (await admin.get(`/desempeno/ciclos/${creado.cicloId}/consolidado`)).cuerpo;
const filas = consolidado?.items ?? consolidado?.personas ?? consolidado ?? [];
console.log(`   ... el consolidado trae ${filas.length ?? 0} fila(s)`);
comprobar((filas.length ?? 0) > 0, 'el consolidado del ciclo trae a su gente', 'sale vacio');
/*
  LA FILA DEL JEFE, NO LA DE LA AUTOEVALUACION. Cada persona tiene DOS filas en el ciclo —la suya y
  la de su jefe—, que es lo que permite compararlas lado a lado. Coger la primera que aparezca da
  la autoevaluacion, que aqui nadie entrego y por tanto no tiene nota: seria un falso fallo.
*/
const suyasEnInforme = filas.filter?.((f) => (f.subjectUserId ?? f.userId) === deNomina.id) ?? [];
console.log(`   ... tiene ${suyasEnInforme.length} fila(s): ${suyasEnInforme.map((f) => f.reviewerRole ?? '?').join(', ')}`);
const filaDeNomina = suyasEnInforme.find((f) => f.reviewerRole !== 'SELF') ?? suyasEnInforme[0];
comprobar(!!filaDeNomina, 'incluida la persona que se evaluo', 'no aparece la persona evaluada');
if (filaDeNomina && notaEntregada !== null) {
  // `Number()` en los dos: la nota viaja como Decimal de Prisma y puede llegar como texto en JSON.
  // Comparar "80" con 80 daria un falso fallo justo en la comprobacion que existe para detectar
  // que dos pantallas digan cosas distintas.
  const notaEnInforme = Number(filaDeNomina.score ?? filaDeNomina.scorePct ?? filaDeNomina.nota ?? NaN);
  comprobar(
    notaEnInforme === Number(notaEntregada),
    `y con la MISMA nota que entrego el jefe (${notaEntregada})`,
    `el informe dice ${notaEnInforme} y el jefe entrego ${notaEntregada}: dos pantallas, dos verdades`,
  );
}

const xlsx = await admin.pedir(`/desempeno/ciclos/${creado.cicloId}/consolidado/xlsx`);
comprobar(xlsx.estado === 200, `el consolidado se baja en xlsx (${xlsx.estado})`, `xlsx: ${xlsx.estado}`);

// ───────────────────────────────────────────────────────────────────────────────
paso(9, 'CERRAR EL CICLO');
const cerrar = await admin.post(`/desempeno/ciclos/${creado.cicloId}/cerrar`);
comprobar(cerrar.ok, `ciclo cerrado (${cerrar.estado})`, `cerrar: ${cerrar.estado} ${JSON.stringify(cerrar.cuerpo).slice(0, 250)}`);

console.log(`\nCREADO PARA LIMPIAR: ciclo=${creado.cicloId} areas=${[creado.areaMadre, ...creado.subAreas].join(',')} sufijo=${SUFIJO}`);
console.log('   (las personas las desactiva `pnpm --filter @neo-pulse/api dev:limpiar-pruebas`)');
process.exit(resumen() === 0 ? 0 : 1);
