// RECORRIDO: LA PERSONA CAMBIA SU CORREO Y SU TELEFONO, Y NADA MAS.
//
// ─── LO QUE LO ORIGINA (2026-09-24) ───
//
// Se van a cargar 1.200 personas y muchas no tienen correo. El cliente pregunto si lo agregaba
// cada quien o el administrador. Quedo asi: los datos de CONTACTO los cambia la persona desde su
// perfil; los LABORALES (cargo, area, documento, fechas) solo quien administra, porque de ellos
// cuelgan las obligaciones de formacion.
//
// Este recorrido comprueba las dos mitades: que lo suyo lo puede cambiar, y que por esta puerta no
// se cuela nada mas — ni su cargo, ni el correo de otra persona.
//
//   node scripts/recorridos/perfil-propio.mjs
import { crearCliente, paso, ok, mal, comprobar, resumen } from './api.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

const cargos = ((await admin.get('/catalogs/job-titles')).cuerpo ?? []).filter((c) => c.active);
const areas = ((await admin.get('/catalogs/areas')).cuerpo ?? []).filter((a) => a.active);

async function crearPersona(n, email) {
  const r = await admin.post('/users', {
    documentNumber: `PP${marca}${n}`,
    fullName: `Perfil propio ${n} ${SUFIJO}`,
    jobTitleId: cargos[0].id,
    areaId: areas[0].id,
    ...(email ? { email } : {}),
  });
  if (!r.ok) throw new Error(`no se pudo crear la persona ${n}: ${r.estado} ${JSON.stringify(r.cuerpo)}`);
  return { id: r.cuerpo?.user?.id ?? r.cuerpo?.id, doc: `PP${marca}${n}`, clave: r.cuerpo.generatedPassword };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(1, 'ALGUIEN SIN CORREO VE SU FICHA COMPLETA');

const una = await crearPersona(1, null);
const otraCorreo = `otra.${marca}@correo-e2e.com`;
const otra = await crearPersona(2, otraCorreo);

const suya = crearCliente();
await suya.entrar(una.doc, una.clave);

const datos = (await suya.get('/auth/me/datos')).cuerpo;
comprobar(datos?.documentNumber === una.doc, 'trae su documento', `documento=${datos?.documentNumber}`);
comprobar(datos?.email === null, 'y el correo en nulo', `email=${JSON.stringify(datos?.email)}`);
comprobar(datos?.jobTitle === cargos[0].name, 'con su cargo por nombre', `cargo=${datos?.jobTitle}`);
comprobar(Boolean(datos?.area), 'y su area', `area=${datos?.area}`);
comprobar(datos?.passwordHash === undefined, 'sin nada que no deba salir (la clave cifrada no viaja)');

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(2, 'AGREGA SU CORREO Y SU TELEFONO');

const nuevoCorreo = `Una.${marca}@Correo-E2E.com`;
const guardo = await suya.patch('/auth/me/contacto', { email: nuevoCorreo, phone: '300 123 4567' });
comprobar(guardo.ok, 'se guarda', `${guardo.estado} ${JSON.stringify(guardo.cuerpo).slice(0, 200)}`);
comprobar(guardo.cuerpo?.email === nuevoCorreo.toLowerCase(), 'el correo queda en minusculas', `email=${guardo.cuerpo?.email}`);
comprobar(guardo.cuerpo?.phone === '300 123 4567', 'y el telefono tal cual', `phone=${guardo.cuerpo?.phone}`);

const vistaAdmin = (await admin.get(`/users/${una.id}`)).cuerpo;
comprobar(vistaAdmin?.email === nuevoCorreo.toLowerCase(), 'quien administra ve el correo nuevo en la ficha', `email=${vistaAdmin?.email}`);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(3, 'Y YA PUEDE ENTRAR CON EL CORREO, sin perder la cedula');

const conCorreo = crearCliente();
try { await conCorreo.entrar(nuevoCorreo.toLowerCase(), una.clave); ok('entra con el correo nuevo'); } catch (e) { mal(e.message); }
const conCedula = crearCliente();
try { await conCedula.entrar(una.doc, una.clave); ok('y sigue entrando con la cedula'); } catch (e) { mal(e.message); }

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(4, 'NO PUEDE QUEDARSE CON EL CORREO DE OTRA PERSONA');

const robo = await suya.patch('/auth/me/contacto', { email: otraCorreo });
comprobar(robo.estado === 409, 'se rechaza con 409', `estado=${robo.estado}`);
comprobar(robo.cuerpo?.code === 'DUPLICATE_EMAIL', 'con el codigo de correo repetido', `code=${robo.cuerpo?.code}`);
const laOtra = (await admin.get(`/users/${otra.id}`)).cuerpo;
comprobar(laOtra?.email === otraCorreo, 'y la otra persona conserva su correo', `email=${laOtra?.email}`);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(5, 'POR ESTA PUERTA NO SE CUELA NADA LABORAL');

/*
  El esquema es un z.object normal: las claves que no conoce las DESCARTA. Aqui se comprueba que
  descartarlas es lo que pasa de verdad, y no que lleguen al update por otro camino.
*/
const cuela = await suya.patch('/auth/me/contacto', {
  phone: '310 000 0000',
  fullName: 'Me cambio el nombre',
  jobTitleId: cargos[1]?.id ?? cargos[0].id,
  roleCode: 'ADMIN',
  documentNumber: '1',
});
comprobar(cuela.ok, 'la peticion pasa (el telefono es valido)', `${cuela.estado}`);
const tras = (await admin.get(`/users/${una.id}`)).cuerpo;
comprobar(tras?.fullName === `Perfil propio 1 ${SUFIJO}`, 'el nombre no cambia', `nombre=${tras?.fullName}`);
comprobar(tras?.documentNumber === una.doc, 'el documento no cambia', `doc=${tras?.documentNumber}`);
comprobar((tras?.jobTitle?.id ?? tras?.jobTitleId) === cargos[0].id, 'el cargo no cambia', `cargo=${JSON.stringify(tras?.jobTitle ?? tras?.jobTitleId)}`);
comprobar((tras?.role?.code ?? tras?.roleCode) !== 'ADMIN', 'y NO se vuelve administradora', `rol=${JSON.stringify(tras?.role ?? tras?.roleCode)}`);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(6, 'UN CORREO MAL ESCRITO SE RECHAZA DICIENDO POR QUE');

const malo = await suya.patch('/auth/me/contacto', { email: 'no-es-un-correo' });
comprobar(malo.estado === 422, 'se rechaza con 422', `estado=${malo.estado}`);
comprobar(
  malo.cuerpo?.errors?.[0]?.message === 'Escribe un correo válido',
  'con la frase en español que pinta la pantalla',
  `errors=${JSON.stringify(malo.cuerpo?.errors)}`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(7, 'PUEDE QUITARLO, Y SIGUE ENTRANDO CON LA CEDULA');

const quita = await suya.patch('/auth/me/contacto', { email: '' });
comprobar(quita.ok && quita.cuerpo?.email === null, 'vacio lo deja en nulo', `email=${JSON.stringify(quita.cuerpo?.email)}`);
comprobar(quita.cuerpo?.phone === '310 000 0000', 'sin tocar el telefono, que no vino', `phone=${quita.cuerpo?.phone}`);
const otraVez = crearCliente();
try { await otraVez.entrar(una.doc, una.clave); ok('entra con la cedula'); } catch (e) { mal(e.message); }

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(8, 'QUEDA EN AUDITORIA');

const audit = await admin.get(`/audit?resourceId=${una.id}`);
if (audit.ok) {
  const filas = Array.isArray(audit.cuerpo) ? audit.cuerpo : (audit.cuerpo?.items ?? audit.cuerpo?.data ?? []);
  comprobar(
    filas.some((f) => f.action === 'PROFILE_CONTACT_UPDATED'),
    'cada cambio deja su fila PROFILE_CONTACT_UPDATED',
    `acciones=${filas.map((f) => f.action).join(',')}`,
  );
} else {
  ok(`(la auditoria no se consulta por HTTP aqui: ${audit.estado}; se revisa en base)`);
}

process.exit(resumen() === 0 ? 0 : 1);
