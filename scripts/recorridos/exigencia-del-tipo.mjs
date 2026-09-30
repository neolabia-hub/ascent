// RECORRIDO: A QUIEN SE LE EXIGE LO DECIDE EL TIPO, Y SE CAMBIA DESDE CONFIGURACION.
//
// ─── LO QUE LO ORIGINA (2026-09-30) ───
//
// «Quien decide» y «a quien alcanza al publicar» vivian solo en la semilla del tipo. El cliente
// pregunto si la induccion debia asignarse sola o dejarlo a quien la crea: es politica de empresa,
// y desde hoy se elige en Configuracion > Tipos de formacion.
//
// Se comprueba con un tipo PROPIO del recorrido, para no tocar los de la empresa:
//   - «quien la crea»: publicar no exige nada;
//   - «sola, solo a quien ingrese»: publicar crea UNA regla de ingreso, solo para nuevos;
//   - y cambiar el tipo NO reescribe lo ya publicado.
//
// No se prueba «sola, a toda la plantilla» publicando: obligaria a todo desarrollo. Ese camino es
// el de la reinduccion y lo cubren `reinduccion.mjs` y `estandar.mjs`.
//
//   node scripts/recorridos/exigencia-del-tipo.mjs
import { crearCliente, paso, ok, mal, comprobar, resumen } from './api.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

const procesos = (await admin.get('/catalogs/processes')).cuerpo ?? [];
const proceso = procesos.find((p) => p.active) ?? procesos[0];

/** Una formacion del tipo, con una leccion, publicada. Devuelve su id. */
async function publicarUna(tipoId, n) {
  const ficha = await admin.post('/activities', {
    code: `EXT_${marca}_${n}`,
    name: `Exigencia del tipo ${n} ${SUFIJO}`,
    activityTypeId: tipoId,
    processId: proceso.id,
    modality: 'VIRTUAL',
  });
  if (!ficha.ok) throw new Error(`ficha ${n}: ${ficha.estado} ${JSON.stringify(ficha.cuerpo)}`);
  const id = ficha.cuerpo.id;
  const version = (await admin.get(`/activities/${id}`)).cuerpo.versions.find((v) => v.status === 'DRAFT').id;
  const leccion = await admin.post('/lessons', { title: `Leccion ${n} ${SUFIJO}`, estimatedMinutes: 3 });
  await admin.pedir(`/lessons/${leccion.cuerpo.id}/cards`, {
    method: 'PUT',
    body: JSON.stringify({ cards: [{ payload: { cardType: 'TEXT_IMAGE', title: 'Hola', body: 'Contenido de prueba.' } }] }),
  });
  await admin.post(`/activities/versions/${version}/contents`, {
    type: 'LESSON', title: 'Leccion', isRequired: true, config: { minSeconds: 1 }, lessonId: leccion.cuerpo.id,
  });
  const publicada = await admin.post(`/activities/versions/${version}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
  if (!publicada.ok) throw new Error(`publicar ${n}: ${publicada.estado} ${JSON.stringify(publicada.cuerpo)}`);
  return id;
}

const configBase = {
  requiresAssessment: false,
  requiresSurvey: false,
  issuesCertificate: false,
  defaultOfferingKind: 'PERMANENT',
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(1, 'UN TIPO PROPIO, en «la decide quien la crea»');
const tipo = await admin.post('/catalogs/activity-types', {
  code: `TIPO_${marca}`,
  name: `Tipo recorrido ${SUFIJO}`,
  config: { ...configBase, defaultAssignmentMode: 'MANUAL' },
});
comprobar(tipo.ok, 'tipo creado', `${tipo.estado} ${JSON.stringify(tipo.cuerpo)}`);
const tipoId = tipo.cuerpo?.id;
if (!tipoId) { resumen(); process.exit(1); }

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(2, 'PUBLICAR con «quien la crea»: no se exige a nadie');
const primera = await publicarUna(tipoId, 1);
const reglas1 = (await admin.get(`/activities/${primera}/requirements`)).cuerpo ?? [];
comprobar(reglas1.length === 0, 'no nace ninguna regla: la decide quien la crea', `nacieron ${reglas1.length}`);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(3, 'CAMBIAR EL TIPO en Configuracion: sola, solo a quien ingrese');
const cambio = await admin.patch(`/catalogs/activity-types/${tipoId}`, {
  config: { ...configBase, defaultAssignmentMode: 'ON_HIRE', requiresBeforeHire: true },
});
comprobar(cambio.ok, 'se guarda desde la API de Configuracion', `${cambio.estado} ${JSON.stringify(cambio.cuerpo)}`);
const releido = ((await admin.get('/catalogs/activity-types')).cuerpo ?? []).find((t) => t.id === tipoId);
comprobar(
  releido?.config?.defaultAssignmentMode === 'ON_HIRE' && releido?.config?.requiresBeforeHire === true,
  'y queda guardado tal cual',
  JSON.stringify(releido?.config),
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(4, 'PUBLICAR otra: ahora se exige sola, a quien ingrese');
const segunda = await publicarUna(tipoId, 2);
const reglas2 = (await admin.get(`/activities/${segunda}/requirements`)).cuerpo ?? [];
comprobar(reglas2.length === 1, 'nace UNA regla sola, sin pulsar nada', `nacieron ${reglas2.length}`);
comprobar(reglas2[0]?.reachesEveryone === true, 'alcanza a toda la empresa', JSON.stringify(reglas2[0]));
comprobar(reglas2[0]?.trigger === 'ON_HIRE' && reglas2[0]?.soloNuevos === true, 'al ingresar, y solo a los nuevos', JSON.stringify(reglas2[0]));
comprobar(reglas2[0]?.assignmentCount === 0, 'hoy no obliga a nadie: la gente ya estaba', `obliga a ${reglas2[0]?.assignmentCount}`);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(5, 'LO YA PUBLICADO NO SE REESCRIBE');
const reglas1bis = (await admin.get(`/activities/${primera}/requirements`)).cuerpo ?? [];
comprobar(reglas1bis.length === 0, 'la primera sigue sin regla aunque el tipo cambio', `ahora tiene ${reglas1bis.length}`);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(6, 'LIMPIEZA: el tipo se desactiva (esta en uso, no se puede borrar)');
const apaga = await admin.patch(`/catalogs/activity-types/${tipoId}`, { active: false });
apaga.ok ? ok('tipo desactivado') : mal(`no se pudo desactivar: ${apaga.estado}`);

process.exit(resumen() === 0 ? 0 : 1);
