// RECORRIDO: QUE TIPOS DE FORMACION PUEDE TOCAR CADA ROL Y CADA PERSONA.
//
// ─── LO QUE LO ORIGINA ───
//
// El cliente: *"el rol analista solo debe ver pocas cosas, en formacion solo poder crear tipo plan,
// ellos no pueden crear otros tipos de formaciones... la idea es que todo esto sea por permisos en
// rol e individual por usuarios"*.
//
// Asi que no se cablea «PLAN»: se configura. Este recorrido prueba las dos cosas que, si se
// rompen, NO dan error y se descubren tarde:
//
//   1. que «sin configurar nada» siga siendo «puede con todos» — lo contrario dejaria a la empresa
//      entera sin poder crear una formacion el dia del despliegue;
//   2. que lo de la PERSONA mande sobre lo del ROL, que es la precedencia que se eligio.
//
//   node scripts/recorridos/alcance-por-tipo.mjs
import { crearCliente, paso, ok, mal, comprobar, resumen } from './api.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(1, 'MONTAJE: un analista, y dos tipos de formacion distintos');

const tipos = ((await admin.get('/catalogs/activity-types')).cuerpo ?? []).filter((t) => t.active);
const tipoPlan = tipos.find((t) => t.code === 'PLAN') ?? tipos[0];
const tipoOtro = tipos.find((t) => t.id !== tipoPlan.id);
comprobar(!!tipoPlan && !!tipoOtro, `hay al menos dos tipos: ${tipoPlan?.name} y ${tipoOtro?.name}`, 'hacen falta dos tipos');
if (!tipoOtro) { resumen(); process.exit(1); }

const procesos = (await admin.get('/catalogs/processes')).cuerpo ?? [];
const proceso = procesos.find((p) => p.active) ?? procesos[0];
const cargos = ((await admin.get('/catalogs/job-titles')).cuerpo ?? []).filter((c) => c.active);
const areas = ((await admin.get('/catalogs/areas')).cuerpo ?? []).filter((a) => a.active);

const roles = (await admin.get('/roles')).cuerpo ?? [];
const rolAnalista = roles.find((r) => r.code === 'ANALISTA');
comprobar(!!rolAnalista, 'existe el rol ANALISTA', 'no esta el rol');
if (!rolAnalista) { resumen(); process.exit(1); }

const doc = `AT${marca}1`;
const alta = await admin.post('/users', {
  documentNumber: doc,
  fullName: `Analista de tipos ${SUFIJO}`,
  jobTitleId: cargos[0].id,
  areaId: areas[0].id,
  roleCode: 'ANALISTA',
});
const personaId = alta.cuerpo?.id ?? alta.cuerpo?.user?.id;
const clave = alta.cuerpo?.generatedPassword ?? alta.cuerpo?.password;
comprobar(!!personaId && !!clave, 'se crea el analista', `alta: ${alta.estado}`);
if (!personaId) { resumen(); process.exit(1); }

/** Entra de nuevo: el alcance viaja en el token, asi que hay que renovarlo tras cada cambio. */
const entrarComoAnalista = async () => {
  const c = crearCliente();
  await c.entrar(doc, clave);
  return c;
};

const crearFormacion = (cliente, tipo, nombre) =>
  cliente.post('/activities', {
    // El codigo solo admite mayusculas, digitos y guion bajo.
    code: `AT_${nombre.toUpperCase()}_${SUFIJO}`,
    name: `${nombre} ${SUFIJO}`,
    description: 'Recorrido del alcance por tipo.',
    activityTypeId: tipo.id,
    processId: proceso.id,
    modality: 'VIRTUAL',
  });

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(2, 'SIN CONFIGURAR NADA, puede con TODOS los tipos');

/*
  El convenio que evita el desastre: acotar es un acto deliberado. Si «sin filas» significara
  «ninguno», el dia del despliegue nadie podria crear una formacion sin que se hubiera pedido.
*/
let analista = await entrarComoAnalista();
const libre1 = await crearFormacion(analista, tipoPlan, 'LibrePlan');
const libre2 = await crearFormacion(analista, tipoOtro, 'LibreOtro');
comprobar(libre1.ok, `crea una de tipo ${tipoPlan.name}`, `${libre1.estado} ${JSON.stringify(libre1.cuerpo).slice(0, 160)}`);
comprobar(libre2.ok, `y otra de tipo ${tipoOtro.name}`, `${libre2.estado} ${JSON.stringify(libre2.cuerpo).slice(0, 160)}`);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(3, 'SE ACOTA EL ROL a un solo tipo');

const fijarRol = await admin.pedir(`/roles/${rolAnalista.id}/tipos`, {
  method: 'PUT',
  body: JSON.stringify({ activityTypeIds: [tipoPlan.id] }),
});
comprobar(fijarRol.ok, `el rol ANALISTA queda acotado a ${tipoPlan.name}`, `${fijarRol.estado} ${JSON.stringify(fijarRol.cuerpo).slice(0, 160)}`);

analista = await entrarComoAnalista();
const conRol1 = await crearFormacion(analista, tipoPlan, 'RolPlan');
const conRol2 = await crearFormacion(analista, tipoOtro, 'RolOtro');
comprobar(conRol1.ok, `sigue creando las de ${tipoPlan.name}`, `${conRol1.estado}`);
comprobar(
  conRol2.estado === 403 && conRol2.cuerpo?.code === 'ACTIVITY_TYPE_OUT_OF_SCOPE',
  `y las de ${tipoOtro.name} se rechazan con ACTIVITY_TYPE_OUT_OF_SCOPE`,
  `esperaba 403 ACTIVITY_TYPE_OUT_OF_SCOPE y llego ${conRol2.estado} ${conRol2.cuerpo?.code}`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(4, 'Y EL CATALOGO solo le enseña lo suyo');

const suCatalogo = (await analista.get('/activities?pageSize=100')).cuerpo?.items ?? [];
const ajenas = suCatalogo.filter((a) => a.activityType?.id !== tipoPlan.id);
comprobar(
  ajenas.length === 0,
  `en su catalogo solo hay formaciones de ${tipoPlan.name} (${suCatalogo.length} en total)`,
  `ve ${ajenas.length} de otros tipos: ${ajenas.slice(0, 3).map((a) => a.activityType?.name).join(', ')}`,
);

/*
  Y pedir explicitamente un tipo que no es suyo da VACIO. Ni lo suyo —que seria mentirle, porque la
  pantalla diria otra cosa— ni un 403, que le confirmaria que ese tipo existe.
*/
const pidiendoAjeno = (await analista.get(`/activities?activityTypeId=${tipoOtro.id}&pageSize=10`)).cuerpo;
comprobar(
  (pidiendoAjeno?.items ?? []).length === 0,
  'y filtrar por un tipo ajeno devuelve vacio, no un error ni lo suyo',
  `devolvio ${(pidiendoAjeno?.items ?? []).length} filas`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(5, 'LO DE LA PERSONA MANDA SOBRE LO DEL ROL');

/*
  La precedencia elegida: si a alguien se le marcan tipos, valen los suyos AUNQUE SEAN MAS que los
  de su rol. Es la misma que ya rige los permisos sueltos — tener dos reglas distintas en el mismo
  producto es la forma mas corta de que alguien configure una creyendo la otra.
*/
const fijarPersona = await admin.pedir(`/users/${personaId}/analyst-scopes`, {
  method: 'POST',
  body: JSON.stringify({ scopes: [{ activityTypeId: tipoOtro.id }] }),
});
comprobar(fijarPersona.ok, `a esta persona se le marca ${tipoOtro.name}, que su rol NO tiene`, `${fijarPersona.estado} ${JSON.stringify(fijarPersona.cuerpo).slice(0, 160)}`);

analista = await entrarComoAnalista();
const personaGana = await crearFormacion(analista, tipoOtro, 'PersonaOtro');
comprobar(personaGana.ok, `ahora SI crea las de ${tipoOtro.name}: lo suyo manda`, `${personaGana.estado} ${JSON.stringify(personaGana.cuerpo).slice(0, 160)}`);

const personaPierde = await crearFormacion(analista, tipoPlan, 'PersonaPlan');
comprobar(
  personaPierde.estado === 403,
  `y deja de poder con ${tipoPlan.name}: lo suyo SUSTITUYE al rol, no lo suma`,
  `esperaba 403 y llego ${personaPierde.estado}`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(6, 'QUITARLE LO SUYO le devuelve lo del rol');

await admin.pedir(`/users/${personaId}/analyst-scopes`, { method: 'POST', body: JSON.stringify({ scopes: [] }) });
analista = await entrarComoAnalista();
const vuelveAlRol = await crearFormacion(analista, tipoPlan, 'VuelvePlan');
comprobar(vuelveAlRol.ok, `vuelve a poder con ${tipoPlan.name}, que es lo de su rol`, `${vuelveAlRol.estado}`);

const sigueSinElOtro = await crearFormacion(analista, tipoOtro, 'VuelveOtro');
comprobar(sigueSinElOtro.estado === 403, `y sigue sin poder con ${tipoOtro.name}`, `esperaba 403 y llego ${sigueSinElOtro.estado}`);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(7, 'DESACOTAR EL ROL se lo devuelve todo — y deja el tenant como estaba');

/*
  Importa que esto funcione: es la unica forma de deshacer desde la pantalla un rol acotado por
  error. Y ademas deja la base del recorrido como la encontro.
*/
const desacotar = await admin.pedir(`/roles/${rolAnalista.id}/tipos`, {
  method: 'PUT',
  body: JSON.stringify({ activityTypeIds: [] }),
});
comprobar(desacotar.ok, 'se guarda la lista vacia', `${desacotar.estado}`);

analista = await entrarComoAnalista();
const finalOtro = await crearFormacion(analista, tipoOtro, 'FinalOtro');
comprobar(finalOtro.ok, 'y vuelve a poder con cualquier tipo', `${finalOtro.estado} ${JSON.stringify(finalOtro.cuerpo).slice(0, 160)}`);

const comoEstaba = (await admin.get(`/roles/${rolAnalista.id}/tipos`)).cuerpo;
comprobar(
  (comoEstaba?.activityTypeIds ?? []).length === 0,
  'el rol ANALISTA queda sin acotar, como estaba antes del recorrido',
  `quedo con ${(comoEstaba?.activityTypeIds ?? []).length} tipos`,
);

console.log(`\nCreado con sufijo ${SUFIJO}: varias formaciones y 1 persona.`);
process.exit(resumen() === 0 ? 0 : 1);
