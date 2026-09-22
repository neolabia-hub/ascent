// RECORRIDO: UNA PERSONA SIN CORREO, DE PUNTA A PUNTA.
//
// ─── LO QUE LO ORIGINA ───
//
// El cliente cargo su plantilla y le salieron 1.089 filas en rojo. Una parte era el area vacia; la
// otra, la pregunta que hizo despues: *"¿que pasa si no hay correo o el usuario no tiene correo,
// como se crea el usuario? porque eso pasa a veces, no tiene correo"*.
//
// Hasta el 2026-09-21 el correo era obligatorio, asi que la salida practica era **inventar una
// direccion** —`1116267708@empresa.com`—, y eso es peor que no tener ninguna: parece un correo,
// nadie lo lee, y despues no hay forma de saber quien tiene uno de verdad.
//
// Ahora `users.email` admite NULO, y nulo significa exactamente eso. Este recorrido comprueba que
// ese nulo **no deja a nadie fuera de nada**, que es lo unico que importaba de la decision.
//
//   node scripts/recorridos/sin-correo.mjs
import { crearCliente, paso, ok, mal, comprobar, resumen } from './api.mjs';

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(1, 'CREAR A ALGUIEN SIN CORREO desde la pantalla de Usuarios');

const cargos = ((await admin.get('/catalogs/job-titles')).cuerpo ?? []).filter((c) => c.active);
const areas = ((await admin.get('/catalogs/areas')).cuerpo ?? []).filter((a) => a.active);
const cargo = cargos[0];
const area = areas[0];

const doc = `SC${marca}1`;
const creada = await admin.post('/users', {
  documentNumber: doc,
  fullName: `Sin correo ${SUFIJO}`,
  jobTitleId: cargo.id,
  areaId: area.id,
});
comprobar(creada.ok, 'se crea sin mandar el campo "email" siquiera', `creacion: ${creada.estado} ${JSON.stringify(creada.cuerpo).slice(0, 200)}`);
const personaId = creada.cuerpo?.id ?? creada.cuerpo?.user?.id;
const clave = creada.cuerpo?.generatedPassword ?? creada.cuerpo?.password;
if (!personaId) { resumen(); process.exit(1); }

const ficha = (await admin.get(`/users/${personaId}`)).cuerpo;
comprobar(
  ficha?.email === null,
  'y su correo queda NULO, no una direccion inventada',
  `email=${JSON.stringify(ficha?.email)} — si trae algo, alguien la fabrico`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(2, 'Y ENTRA CON SU CEDULA, que es lo unico que hacia falta que siguiera funcionando');

const suyo = crearCliente();
let entro = false;
try { await suyo.entrar(doc, clave); entro = true; } catch (e) { mal(`no pudo entrar con la cedula: ${e.message}`); }
if (entro) ok('inicia sesion con la cedula y su clave generada');

if (entro) {
  const yo = (await suyo.get('/auth/me')).cuerpo;
  comprobar(yo?.id === personaId, 'y la sesion es la suya', `me devolvio ${yo?.id}`);
  comprobar(yo?.email === null, 'con el correo en nulo, sin inventarse nada', `email=${JSON.stringify(yo?.email)}`);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(3, 'DOS PERSONAS SIN CORREO NO CHOCAN ENTRE SI');

/*
  El indice unico es (tenant, email). Si «sin correo» se hubiera guardado como cadena vacia en vez
  de NULO, la SEGUNDA persona sin correo chocaria con la primera y la carga se caeria a la mitad
  con un «correo repetido» incomprensible. En Postgres los nulos no chocan: por eso es nulo.
*/
const doc2 = `SC${marca}2`;
const otra = await admin.post('/users', {
  documentNumber: doc2,
  fullName: `Sin correo dos ${SUFIJO}`,
  jobTitleId: cargo.id,
  areaId: area.id,
});
comprobar(otra.ok, 'una segunda persona sin correo entra igual', `segunda: ${otra.estado} ${JSON.stringify(otra.cuerpo).slice(0, 200)}`);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(4, 'EDITAR SU FICHA NO LE BORRA NI LE INVENTA EL CORREO');

/*
  La trampa de este cambio, y por poco se cuela: `updateUserSchema` es el de creacion en `.partial()`,
  asi que al guardar cualquier cambio de una ficha el correo puede NO VENIR. Si «no vino» se hubiera
  traducido a `null`, **guardar el telefono de alguien le habria borrado el correo**.
*/
const conCorreo = await admin.post('/users', {
  documentNumber: `SC${marca}3`,
  fullName: `Con correo ${SUFIJO}`,
  email: `sc${marca}3@recorrido.test`,
  jobTitleId: cargo.id,
  areaId: area.id,
});
const conCorreoId = conCorreo.cuerpo?.id ?? conCorreo.cuerpo?.user?.id;
await admin.patch(`/users/${conCorreoId}`, { phone: '3001234567' });
const trasEditar = (await admin.get(`/users/${conCorreoId}`)).cuerpo;
comprobar(
  trasEditar?.email === `sc${marca}3@recorrido.test`,
  'guardar otro campo NO le borra el correo a quien si lo tiene',
  `email quedo en ${JSON.stringify(trasEditar?.email)}`,
);

// Y al reves: dejarlo en blanco a proposito SI lo quita, porque eso es lo que se pidio.
await admin.patch(`/users/${conCorreoId}`, { email: '' });
const trasVaciar = (await admin.get(`/users/${conCorreoId}`)).cuerpo;
comprobar(
  trasVaciar?.email === null,
  'y dejarlo en blanco a proposito SI lo quita: son dos gestos distintos',
  `email quedo en ${JSON.stringify(trasVaciar?.email)}`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(5, 'LA CARGA MASIVA: filas sin correo entran, y el motivo de las malas se lee en español');

const csv = [
  'documento;nombre_completo;correo;telefono;cargo;tipo_cargo;area;sub_area;regional;servicio;fecha_ingreso',
  // Sin correo y sin telefono: los dos opcionales.
  `SC${marca}4;Cargada sin correo ${SUFIJO};;;${cargo.name};;${area.name};;;;`,
  // Con correo, para que convivan en el mismo archivo.
  `SC${marca}5;Cargada con correo ${SUFIJO};sc${marca}5@recorrido.test;;${cargo.name};;${area.name};;;;`,
  // Sin area: tiene que fallar, y decir POR QUE en español.
  `SC${marca}6;Cargada sin area ${SUFIJO};;;${cargo.name};;;;;;`,
].join('\n');

const form = new FormData();
form.append('file', new Blob([csv], { type: 'text/csv' }), `carga-${SUFIJO}.csv`);
const carga = await admin.pedir('/users/import', { method: 'POST', body: form });
comprobar(carga.ok, 'el archivo se procesa', `import: ${carga.estado} ${JSON.stringify(carga.cuerpo).slice(0, 200)}`);

const filas = carga.cuerpo?.rows ?? [];
const sinCorreo = filas.find((f) => f.documento === `SC${marca}4`);
const conCorreoFila = filas.find((f) => f.documento === `SC${marca}5`);
const sinArea = filas.find((f) => f.documento === `SC${marca}6`);

comprobar(sinCorreo?.status === 'OK', 'la fila SIN correo entra', `quedo ${sinCorreo?.status}: ${sinCorreo?.error}`);
comprobar(conCorreoFila?.status === 'OK', 'y la fila con correo tambien, en el mismo archivo', `quedo ${conCorreoFila?.status}: ${conCorreoFila?.error}`);
comprobar(sinArea?.status === 'ERROR', 'la fila sin area se rechaza', `quedo ${sinArea?.status}`);

comprobar(
  (sinArea?.error ?? '').includes('Falta "Área"'),
  'con el motivo EN ESPAÑOL y diciendo que falta, no "String must contain at least 2 character(s)"',
  `el motivo dice: ${sinArea?.error}`,
);
comprobar(
  !/String|character|must contain/i.test(sinArea?.error ?? ''),
  'sin una sola palabra en ingles',
  `el motivo dice: ${sinArea?.error}`,
);
comprobar(
  (sinArea?.nombre ?? '').includes('Cargada sin area'),
  'y el aviso trae el NOMBRE de la persona, no solo la cedula',
  `nombre=${JSON.stringify(sinArea?.nombre)}`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(6, 'Y QUIEN ENTRO SIN CORREO POR EL ARCHIVO tambien puede iniciar sesion');

const cargada = filas.find((f) => f.documento === `SC${marca}4`);
if (cargada?.generatedPassword) {
  const suya = crearCliente();
  try {
    await suya.entrar(`SC${marca}4`, cargada.generatedPassword);
    ok('entra con su cedula y la clave que genero la carga');
  } catch (e) {
    mal(`no pudo entrar: ${e.message}`);
  }
} else {
  mal('la carga no devolvio contrasena generada para la fila sin correo');
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(7, 'RECARGAR EL ARCHIVO ACTUALIZA, no rechaza: es el archivo mensual de una empresa');

/*
  Antes, volver a subir la plantilla con las altas del mes devolvia «ya existe» en las 900 filas que
  no habian cambiado, y los traslados de area NO entraban nunca. Ahora la carga es un ESPEJO del
  maestro de personal, con el documento como clave — que es como lo resuelven los LMS y los sistemas
  de nomina.
*/
const otraArea = areas.find((a) => a.id !== area.id) ?? area;
const otroCargo = cargos.find((c) => c.id !== cargo.id) ?? cargo;

const csv2 = [
  'documento;nombre_completo;correo;telefono;cargo;tipo_cargo;area;sub_area;regional;servicio;fecha_ingreso',
  // La misma persona, ahora con correo, otro cargo y otra area: un traslado del mes.
  `SC${marca}4;Cargada sin correo ${SUFIJO};sc${marca}4@recorrido.test;;${otroCargo.name};;${otraArea.name};;;;`,
  // Identica a como esta: no deberia tocarse.
  `SC${marca}5;Cargada con correo ${SUFIJO};sc${marca}5@recorrido.test;;${cargo.name};;${area.name};;;;`,
  // Alguien nuevo, en el mismo archivo.
  `SC${marca}7;Alta del mes ${SUFIJO};;;${cargo.name};;${area.name};;;;`,
].join('\n');

const form2 = new FormData();
form2.append('file', new Blob([csv2], { type: 'text/csv' }), `recarga-${SUFIJO}.csv`);
const recarga = await admin.pedir('/users/import', { method: 'POST', body: form2 });
comprobar(recarga.ok, 'la recarga se procesa sin rechazar a nadie', `import: ${recarga.estado}`);

comprobar(recarga.cuerpo?.failed === 0, 'CERO filas con error, aunque dos ya existian', `failed=${recarga.cuerpo?.failed}`);
comprobar(recarga.cuerpo?.creadas === 1, 'una CREADA: el alta del mes', `creadas=${recarga.cuerpo?.creadas}`);
comprobar(recarga.cuerpo?.actualizadas === 1, 'una ACTUALIZADA: la del traslado', `actualizadas=${recarga.cuerpo?.actualizadas}`);
comprobar(recarga.cuerpo?.sinCambios === 1, 'y una SIN CAMBIOS, que no se toca', `sinCambios=${recarga.cuerpo?.sinCambios}`);

const filasR = recarga.cuerpo?.rows ?? [];
const trasladada = filasR.find((f) => f.documento === `SC${marca}4`);
comprobar(
  (trasladada?.note ?? '').includes('área') && (trasladada?.note ?? '').includes('cargo'),
  'y dice QUE campos cambiaron, no solo que cambio algo',
  `la nota dice: ${trasladada?.note}`,
);
comprobar(
  !trasladada?.generatedPassword,
  'a quien ya estaba NO se le regenera la contraseña: la suya sigue sirviendo',
  'se devolvio una contraseña nueva para alguien que ya existia',
);

const usuarios = (await admin.get(`/users?q=SC${marca}4&pageSize=5`)).cuerpo?.items ?? [];
const fichaTras = usuarios[0];
comprobar(fichaTras?.area?.id === otraArea.id, 'el area quedo cambiada en su ficha', `area=${fichaTras?.area?.name}`);
comprobar(fichaTras?.email === `sc${marca}4@recorrido.test`, 'y el correo que antes no tenia, puesto', `email=${fichaTras?.email}`);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(8, 'UNA CELDA VACIA NO BORRA: el archivo dice lo que dice, no lo que calla');

/*
  La regla que evita el desastre mas caro de este cambio: subir una plantilla con menos columnas
  llenas —o la version vieja del archivo— no puede vaciar los telefonos y las fechas de ingreso de
  media empresa.
*/
await admin.patch(`/users/${fichaTras.id}`, { phone: '3009998877' });
const csv3 = [
  'documento;nombre_completo;correo;telefono;cargo;tipo_cargo;area;sub_area;regional;servicio;fecha_ingreso',
  // Sin telefono y sin correo: las dos celdas vacias.
  `SC${marca}4;Cargada sin correo ${SUFIJO};;;${otroCargo.name};;${otraArea.name};;;;`,
].join('\n');
const form3 = new FormData();
form3.append('file', new Blob([csv3], { type: 'text/csv' }), `vacias-${SUFIJO}.csv`);
await admin.pedir('/users/import', { method: 'POST', body: form3 });

const finales = (await admin.get(`/users?q=SC${marca}4&pageSize=5`)).cuerpo?.items ?? [];
comprobar(finales[0]?.phone === '3009998877', 'el telefono NO se borro con la celda vacia', `phone=${finales[0]?.phone}`);
comprobar(
  finales[0]?.email === `sc${marca}4@recorrido.test`,
  'y el correo tampoco: vacio significa «el archivo no lo dice»',
  `email=${finales[0]?.email}`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(9, 'LA SIMULACION dice lo que pasaria y NO ESCRIBE NADA');

/*
  La defensa contra subir el archivo equivocado. La prueba de verdad no es que devuelva las cifras
  —eso lo hace el mismo codigo que la carga real— sino que **despues de simular, la base este
  exactamente igual**. Por eso se mide antes y despues.
*/
const antesDeSimular = (await admin.get(`/users?q=SC${marca}4&pageSize=5`)).cuerpo?.items ?? [];
const areaAntes = antesDeSimular[0]?.area?.id;
const totalAntes = (await admin.get('/users?pageSize=1')).cuerpo?.total;

const csv4 = [
  'documento;nombre_completo;correo;telefono;cargo;tipo_cargo;area;sub_area;regional;servicio;fecha_ingreso',
  // Un traslado de vuelta al area original: cambiaria, si se aplicara.
  `SC${marca}4;Cargada sin correo ${SUFIJO};sc${marca}4@recorrido.test;;${cargo.name};;${area.name};;;;`,
  // Y alguien que no existe: se crearia.
  `SC${marca}9;Alta simulada ${SUFIJO};;;${cargo.name};;${area.name};;;;`,
].join('\n');

const form4 = new FormData();
form4.append('file', new Blob([csv4], { type: 'text/csv' }), `simular-${SUFIJO}.csv`);
const sim = await admin.pedir('/users/import/simular', { method: 'POST', body: form4 });

comprobar(sim.ok, 'la simulacion responde', `simular: ${sim.estado} ${JSON.stringify(sim.cuerpo).slice(0, 200)}`);
comprobar(sim.cuerpo?.simulacion === true, 'y se identifica como simulacion', `simulacion=${sim.cuerpo?.simulacion}`);
comprobar(sim.cuerpo?.creadas === 1, 'dice que se crearia UNA', `creadas=${sim.cuerpo?.creadas}`);
comprobar(sim.cuerpo?.actualizadas === 1, 'y que cambiaria UNA', `actualizadas=${sim.cuerpo?.actualizadas}`);

const filaSim = (sim.cuerpo?.rows ?? []).find((f) => f.documento === `SC${marca}4`);
comprobar(
  (filaSim?.note ?? '').startsWith('Cambiaría:'),
  'nombrando lo que cambiaria, en condicional',
  `la nota dice: ${filaSim?.note}`,
);
comprobar(
  !(sim.cuerpo?.rows ?? []).some((f) => f.generatedPassword),
  'y sin repartir contraseñas que todavia no existen',
  'la simulacion devolvio una contraseña',
);

// LO QUE DE VERDAD IMPORTA: la base no se movio.
const totalDespues = (await admin.get('/users?pageSize=1')).cuerpo?.total;
comprobar(totalDespues === totalAntes, 'NO se creo a nadie', `habia ${totalAntes} y hay ${totalDespues}`);

const despuesDeSimular = (await admin.get(`/users?q=SC${marca}4&pageSize=5`)).cuerpo?.items ?? [];
comprobar(
  despuesDeSimular[0]?.area?.id === areaAntes,
  'y NO se movio a nadie de area, aunque la simulacion dijera que cambiaria',
  `el area paso de ${areaAntes} a ${despuesDeSimular[0]?.area?.id}`,
);

// Y aplicarlo despues SI lo hace: la vista previa no se come el trabajo.
const form5 = new FormData();
form5.append('file', new Blob([csv4], { type: 'text/csv' }), `aplicar-${SUFIJO}.csv`);
const aplicado = await admin.pedir('/users/import', { method: 'POST', body: form5 });
comprobar(aplicado.cuerpo?.simulacion !== true, 'aplicar de verdad no se marca como simulacion', 'se marco como simulacion');
comprobar(aplicado.cuerpo?.creadas === 1 && aplicado.cuerpo?.actualizadas === 1, 'y hace lo que la vista previa prometio', `creadas=${aplicado.cuerpo?.creadas} actualizadas=${aplicado.cuerpo?.actualizadas}`);

const yaAplicado = (await admin.get(`/users?q=SC${marca}4&pageSize=5`)).cuerpo?.items ?? [];
comprobar(yaAplicado[0]?.area?.id === area.id, 'ahora si quedo movida de area', `area=${yaAplicado[0]?.area?.name}`);

console.log(`\nCreado con sufijo ${SUFIJO}: 7 personas.`);
process.exit(resumen() === 0 ? 0 : 1);
