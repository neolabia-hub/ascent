// RECORRIDO: PROGRAMAS TIENE PERMISOS PROPIOS, Y SIN ELLOS NO SE ENTRA.
//
// ─── LO QUE LO ORIGINA ───
//
// El cliente: *"el rol analista solo debe ver pocas cosas... programa no pueden, solo seguimiento,
// inicio, convocatorias"*.
//
// Hasta el 2026-09-22 Programas usaba los permisos del CATALOGO, asi que quien podia crear una
// formacion veia y tocaba los programas, y no habia forma de quitarselo sin quitarle tambien el
// catalogo — que es justo lo que el analista necesita. Ahora son `programs:read`,
// `programs:manage` y `programs:publish`.
//
// Lo que se prueba, que es lo que se rompe en silencio:
//
//   1. el ADMIN sigue entrando a todo (un permiso nuevo que nadie tiene deja la pantalla muerta y
//      no da error de compilacion);
//   2. el ANALISTA, que conserva el catalogo entero, YA NO entra a programas;
//   3. concederle `programs:read` por permiso INDIVIDUAL le abre la consulta y NADA mas — sigue sin
//      poder crear ni publicar.
//
//   node scripts/recorridos/programas-con-permiso-propio.mjs
import { crearCliente, paso, ok, mal, comprobar, resumen } from './api.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(1, 'MONTAJE: un analista con el catalogo completo');

const cargos = ((await admin.get('/catalogs/job-titles')).cuerpo ?? []).filter((c) => c.active);
const areas = ((await admin.get('/catalogs/areas')).cuerpo ?? []).filter((a) => a.active);

const doc = `PG${marca}1`;
const alta = await admin.post('/users', {
  documentNumber: doc,
  fullName: `Analista de programas ${SUFIJO}`,
  jobTitleId: cargos[0].id,
  areaId: areas[0].id,
  roleCode: 'ANALISTA',
});
const personaId = alta.cuerpo?.id ?? alta.cuerpo?.user?.id;
const clave = alta.cuerpo?.generatedPassword ?? alta.cuerpo?.password;
comprobar(!!personaId && !!clave, 'se crea el analista', `alta: ${alta.estado}`);
if (!personaId) { resumen(); process.exit(1); }

/** Entra de nuevo: los permisos viajan en el token, asi que hay que renovarlo tras cada cambio. */
const entrarComoAnalista = async () => {
  const c = crearCliente();
  await c.entrar(doc, clave);
  return c;
};

let analista = await entrarComoAnalista();
const perfil = (await analista.get('/auth/me')).cuerpo ?? {};
const permisos = perfil.permissions ?? [];
comprobar(permisos.includes('catalog:read'), 'el analista conserva el catalogo formativo', 'no tiene catalog:read');
comprobar(
  !permisos.some((p) => p.startsWith('programs:')),
  'y NO trae ningun permiso de programas',
  `trae: ${permisos.filter((p) => p.startsWith('programs:')).join(', ')}`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(2, 'EL ADMIN SIGUE ENTRANDO A TODO');

const listaAdmin = await admin.get('/programas');
comprobar(listaAdmin.estado === 200, 'el admin lista programas', `estado ${listaAdmin.estado}`);

const creado = await admin.post('/programas', {
  code: `PRG${marca}`,
  name: `Programa de permisos ${SUFIJO}`,
  description: 'Recorrido de permisos propios de Programas',
});
comprobar(creado.estado === 201 || creado.estado === 200, 'el admin crea un programa', `estado ${creado.estado}`);
const programaId = creado.cuerpo?.id;
if (!programaId) { resumen(); process.exit(1); }

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(3, 'EL ANALISTA YA NO ENTRA — ni a mirar');

const leerSinPermiso = await analista.get('/programas');
comprobar(leerSinPermiso.estado === 403, 'listar programas le da 403', `estado ${leerSinPermiso.estado}`);

const fichaSinPermiso = await analista.get(`/programas/${programaId}`);
comprobar(fichaSinPermiso.estado === 403, 'abrir la ficha le da 403', `estado ${fichaSinPermiso.estado}`);

const crearSinPermiso = await analista.post('/programas', {
  code: `NOP${marca}`,
  name: `No deberia existir ${SUFIJO}`,
});
comprobar(crearSinPermiso.estado === 403, 'crear un programa le da 403', `estado ${crearSinPermiso.estado}`);

// Y el catalogo formativo NO se lo llevo por delante: es la mitad del cambio.
const catalogo = await analista.get('/activities');
comprobar(catalogo.estado === 200, 'pero el catalogo de formaciones le sigue abierto', `estado ${catalogo.estado}`);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(4, 'CONCEDER `programs:read` A ESA PERSONA LE ABRE LA CONSULTA, Y NADA MAS');

const concesion = await admin.post(`/users/${personaId}/overrides`, {
  overrides: [{ permissionCode: 'programs:read', granted: true }],
});
comprobar(
  concesion.estado === 200 || concesion.estado === 201,
  'se le concede programs:read como permiso individual',
  `estado ${concesion.estado}: ${JSON.stringify(concesion.cuerpo)}`,
);

analista = await entrarComoAnalista();

const leerConPermiso = await analista.get('/programas');
comprobar(leerConPermiso.estado === 200, 'ahora si lista programas', `estado ${leerConPermiso.estado}`);

const fichaConPermiso = await analista.get(`/programas/${programaId}`);
comprobar(fichaConPermiso.estado === 200, 'y abre la ficha', `estado ${fichaConPermiso.estado}`);

// Ver no es armar: `programs:manage` y `programs:publish` son otros dos, y no se los dio nadie.
const crearConLectura = await analista.post('/programas', {
  code: `NOP2${marca}`,
  name: `Tampoco deberia existir ${SUFIJO}`,
});
comprobar(crearConLectura.estado === 403, 'pero crear le sigue dando 403', `estado ${crearConLectura.estado}`);

const publicarConLectura = await analista.post(`/programas/${programaId}/publicar`, {});
comprobar(publicarConLectura.estado === 403, 'y publicar tambien', `estado ${publicarConLectura.estado}`);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(5, 'LIMPIEZA');

const borrado = await admin.patch(`/programas/${programaId}`, { active: false });
comprobar(borrado.estado === 200, 'se desactiva el programa de prueba', `estado ${borrado.estado}`);

resumen();
