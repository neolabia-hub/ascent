// RECORRIDO: EL PROGRAMA DICE A QUIEN SE LE ASIGNO A MANO Y QUIEN LO TIENE A MEDIAS (2026-10-08).
//
// Pedido del cliente: «A quien se le exige no dice los sueltos o manuales en programas» y «tengo que
// saber si lo tienen todos o no». En produccion el aviso decia «a 18 personas les falta algun modulo»
// y no habia donde ver a quienes: eran casi todos gente con UN modulo puesto a mano.
//
//   1. Programa de dos modulos, sin ninguna regla.
//   2. A una persona se le asigna el PROGRAMA entero; a otra, UN modulo suelto.
//   3. Cada modulo dice cuantas personas lo tienen a mano; el programa, cuantas en total.
//   4. La primera lo tiene entero; la segunda sale, con su nombre, entre las que lo tienen a medias.
//   5. Desactivada la segunda, deja de contar: ya no es un problema por resolver.

import { crearCliente, paso, comprobar, resumen } from './api.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;
await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

paso(1, 'PROGRAMA de dos modulos, sin reglas');
const proceso = ((await admin.get('/catalogs/processes')).cuerpo ?? []).find((p) => p.active);
const cargo = ((await admin.get('/catalogs/job-titles')).cuerpo ?? []).find((c) => c.active);
const area = ((await admin.get('/catalogs/areas')).cuerpo ?? []).find((a) => a.active);
const tipo = await admin.post('/catalogs/activity-types', {
  code: `E2E_PM_${marca}`,
  name: `Programa a mano ${SUFIJO}`,
  config: { requiresAssessment: false, requiresSurvey: false, issuesCertificate: false, defaultOfferingKind: 'PERMANENT', defaultAssignmentMode: 'MANUAL' },
});

async function crearFormacion(nombre) {
  const ficha = await admin.post('/activities', {
    code: `PM${marca}_${nombre}`, name: `Modulo ${nombre} ${SUFIJO}`, activityTypeId: tipo.cuerpo.id, processId: proceso.id, modality: 'VIRTUAL',
  });
  const versionId = ((await admin.get(`/activities/${ficha.cuerpo?.id}`)).cuerpo?.versions ?? []).find((v) => v.status === 'DRAFT')?.id;
  const leccion = await admin.post('/lessons', { title: `Contenido ${nombre} ${SUFIJO}`, estimatedMinutes: 3 });
  await admin.pedir(`/lessons/${leccion.cuerpo?.id}/cards`, {
    method: 'PUT',
    body: JSON.stringify({ cards: [{ payload: { cardType: 'TEXT_IMAGE', title: nombre, body: 'Contenido.' } }] }),
  });
  await admin.post(`/activities/versions/${versionId}/contents`, {
    type: 'LESSON', title: 'Contenido', isRequired: true, config: { minSeconds: 1 }, lessonId: leccion.cuerpo?.id,
  });
  await admin.post(`/activities/versions/${versionId}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });
  return ficha.cuerpo?.id;
}
const moduloA = await crearFormacion('A');
const moduloB = await crearFormacion('B');
const programa = await admin.post('/programas', { code: `PROGRAMA_MANO_${SUFIJO}`, name: `Programa a mano ${SUFIJO}` });
const programaId = programa.cuerpo?.id;
for (const activityId of [moduloA, moduloB]) {
  const agregado = await admin.post(`/programas/${programaId}/modulos`, { activityId, isRequired: true });
  comprobar(agregado.ok, 'modulo agregado', `modulo: ${agregado.estado} ${JSON.stringify(agregado.cuerpo).slice(0, 200)}`);
}
const publicado = await admin.post(`/programas/${programaId}/publicar`, {});
comprobar(publicado.ok, 'programa publicado', `publicar: ${publicado.estado} ${JSON.stringify(publicado.cuerpo).slice(0, 200)}`);

paso(2, 'UNA PERSONA CON EL PROGRAMA ENTERO y otra con un modulo suelto');
async function persona(prefijo, nombre) {
  const alta = await admin.post('/users', { documentNumber: `${prefijo}${marca}`, fullName: `${nombre} ${SUFIJO}`, jobTitleId: cargo.id, areaId: area.id });
  return alta.cuerpo?.user?.id;
}
const entera = await persona('83', 'Programa entero');
const suelta = await persona('84', 'Modulo suelto');
const conPrograma = await admin.post(`/programas/${programaId}/asignar-personas`, { userIds: [entera] });
comprobar(conPrograma.ok && conPrograma.cuerpo?.obligacionesCreadas === 2, 'el programa, a la primera: dos obligaciones', `asignar: ${conPrograma.estado} ${JSON.stringify(conPrograma.cuerpo).slice(0, 200)}`);
const conModulo = await admin.post('/assignments', { targetType: 'ACTIVITY', targetId: moduloA, userIds: [suelta] });
comprobar(conModulo.ok && conModulo.cuerpo?.created === 1, 'un modulo suelto, a la segunda', `asignar: ${conModulo.estado}`);

try {
  paso(3, 'EL PROGRAMA LO DICE: cuantas a mano, por modulo y en total');
  let detalle = (await admin.get(`/programas/${programaId}`)).cuerpo;
  const aManoDe = (id) => detalle?.items?.find((item) => item.itemId === id)?.aMano;
  comprobar(aManoDe(moduloA) === 2, 'el modulo A: 2 personas a mano', `modulo A: ${aManoDe(moduloA)}`);
  comprobar(aManoDe(moduloB) === 1, 'el modulo B: 1 persona a mano', `modulo B: ${aManoDe(moduloB)}`);
  comprobar(detalle?.personasAMano === 2, 'en el programa: 2 personas a mano', `programa: ${detalle?.personasAMano}`);
  comprobar((detalle?.obligados ?? []).length === 0, 'y ninguna regla: antes esto se leia «nadie esta obligado»', `reglas: ${detalle?.obligados?.length}`);

  paso(4, 'QUIEN LO TIENE ENTERO Y QUIEN A MEDIAS, con nombre');
  comprobar(detalle?.conTodos === 1 && detalle?.afectados === 1, 'una lo tiene entero y una a medias', `enteros ${detalle?.conTodos}, a medias ${detalle?.afectados}`);
  const aMedias = detalle?.parciales ?? [];
  comprobar(
    aMedias.length === 1 && aMedias[0].userId === suelta && aMedias[0].modulos === 1 && aMedias[0].aMano === 1 && aMedias[0].fullName.startsWith('Modulo suelto'),
    'la de a medias sale con su nombre: 1 de 2, 1 a mano',
    `parciales: ${JSON.stringify(aMedias)}`,
  );

  paso(5, 'DESACTIVADA, deja de contar');
  await admin.patch(`/users/${suelta}`, { active: false });
  detalle = (await admin.get(`/programas/${programaId}`)).cuerpo;
  comprobar(detalle?.afectados === 0 && (detalle?.parciales ?? []).length === 0, 'ya no sale entre las que lo tienen a medias', `a medias: ${detalle?.afectados}`);
} finally {
  paso(6, 'LIMPIEZA');
  await admin.patch(`/users/${entera}`, { active: false });
  await admin.patch(`/users/${suelta}`, { active: false });
  await admin.patch(`/catalogs/activity-types/${tipo.cuerpo.id}`, { active: false });
  console.log(`CREADO PARA LIMPIAR: sufijo=${SUFIJO}`);
}

process.exit(resumen() === 0 ? 0 : 1);
