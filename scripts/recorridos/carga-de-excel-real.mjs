// RECORRIDO: EL EXCEL QUE MANDA LA EMPRESA, TAL COMO SALE DE EXCEL.
//
// ─── LO QUE LO ORIGINA ───
//
// El cliente subio su plantilla de 1089 personas en produccion el 2026-09-22 y se llevo tres
// portazos seguidos, los tres del sistema y ninguno suyo:
//
//   1. **`v1/users/import/simular` 400** y en pantalla «bad request exception» — el nombre de una
//      clase de Java... de TypeScript, en ingles, sin decir que pasa ni que hacer.
//   2. *«"fecha_nacimiento" no tiene un formato valido: "Tue Jan 06 1998 00:00:00 GMT+0000"»* —
//      un texto que no escribio nadie: lo fabricaba el propio sistema al leer una celda con
//      formato de fecha. Y debajo, la expresion de validacion decia `d{4}` en vez de `\d{4}`, asi
//      que **ninguna fecha de nacimiento habria pasado jamas**, ni la mejor escrita.
//   3. *«"Cargo" es demasiado largo»* para «JEFE DE SEGURIDAD Y SALUD EN EL TRABAJO», que es como
//      se llaman los cargos de verdad en una empresa con SG-SST. El archivo medía 40 y el catalogo
//      de la pantalla, 120.
//
// Este recorrido sube un .xlsx DE VERDAD —construido con la misma libreria que usa el servidor, con
// celdas de fecha de verdad— porque el CSV no reproduce ninguno de los tres: el fallo estaba
// justamente en como se lee una celda de Excel.
//
//   node scripts/recorridos/carga-de-excel-real.mjs
import { createRequire } from 'node:module';
import { crearCliente, paso, ok, mal, comprobar, resumen } from './api.mjs';

// ExcelJS vive en las dependencias de la API, no en la raiz: se resuelve desde alli. Y se usa LA
// MISMA libreria que el servidor a proposito — si se armara el archivo con otra, la prueba diria
// mas sobre las dos librerias que sobre el sistema.
const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const ExcelJS = require('exceljs');

const admin = crearCliente();
const marca = Date.now().toString().slice(-6);
const SUFIJO = `E2E${marca}`;
const CARGO_LARGO = 'JEFE DE SEGURIDAD Y SALUD EN EL TRABAJO';

await admin.entrar('admin@transprensa.com', 'Transprensa2026*');

const cargos = ((await admin.get('/catalogs/job-titles')).cuerpo ?? []).filter((c) => c.active);
const areas = ((await admin.get('/catalogs/areas')).cuerpo ?? []).filter((a) => a.active);
const tiposDeCargo = ((await admin.get('/catalogs/job-title-types')).cuerpo ?? []).filter((t) => t.active);
const area = areas[0];

/** Un .xlsx con las columnas que se le pasen, y las fechas como CELDAS DE FECHA, no como texto. */
async function armarExcel(encabezados, filas) {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Personas');
  hoja.addRow(encabezados);
  for (const fila of filas) hoja.addRow(fila);
  return Buffer.from(await libro.xlsx.writeBuffer());
}

async function subir(buffer, nombre, ruta = '/users/import') {
  const form = new FormData();
  form.append('file', new Blob([buffer]), nombre);
  return admin.pedir(ruta, { method: 'POST', body: form });
}

const ENCABEZADOS = [
  'documento',
  'nombre_completo',
  'correo',
  'telefono',
  'cargo',
  'tipo_cargo',
  'area',
  'sub_area',
  'regional',
  'servicio',
  'fecha_ingreso',
  'fecha_nacimiento',
  'vinculacion',
];

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(1, 'UNA CELDA CON FORMATO DE FECHA — lo que produce Excel de verdad');

/*
  `new Date(...)` en una celda es EXACTAMENTE lo que ExcelJS lee de una celda con formato de fecha.
  Antes esto se convertia a texto con `String(cell.text)` y llegaba a la validacion como
  "Tue Jan 06 1998 00:00:00 GMT+0000 (Coordinated Universal Time)".
*/
const conFechaDeVerdad = await armarExcel(ENCABEZADOS, [
  [
    `XL${marca}1`,
    `Fecha como celda ${SUFIJO}`,
    '',
    '',
    cargos[0].name,
    '',
    area.name,
    '',
    '',
    '',
    new Date(Date.UTC(2020, 2, 15)),
    new Date(Date.UTC(1998, 0, 6)),
    '',
  ],
]);

const r1 = await subir(conFechaDeVerdad, `celdas-fecha-${SUFIJO}.xlsx`);
comprobar(r1.ok, 'el archivo se procesa', `import: ${r1.estado} ${JSON.stringify(r1.cuerpo).slice(0, 300)}`);
const fila1 = (r1.cuerpo?.rows ?? [])[0];
comprobar(fila1?.status === 'OK', 'y la fila entra', `quedo ${fila1?.status}: ${fila1?.error}`);
comprobar(
  !(fila1?.error ?? '').includes('GMT'),
  'sin el "Tue Jan 06 1998 00:00:00 GMT+0000" que veia el cliente',
  `error: ${fila1?.error}`,
);

const creada = (await admin.get(`/users?q=XL${marca}1`)).cuerpo?.items ?? [];
const persona = creada[0];
comprobar(!!persona, 'la persona existe despues de la carga', 'no aparece al buscarla');
if (persona) {
  const ficha = (await admin.get(`/users/${persona.id}`)).cuerpo;
  // Lo que importa no es que entrara: es que la fecha quedara BIEN. Una fecha mal leida en
  // silencio es peor que una fila rechazada.
  comprobar(
    String(ficha?.birthDate ?? '').startsWith('1998-01-06'),
    'y su fecha de nacimiento quedo en el dia correcto, no corrida un dia por la zona horaria',
    `birthDate=${JSON.stringify(ficha?.birthDate)}`,
  );
  comprobar(
    String(ficha?.hiredAt ?? '').startsWith('2020-03-15'),
    'igual que la de ingreso',
    `hiredAt=${JSON.stringify(ficha?.hiredAt)}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(2, 'LA FECHA ESCRITA A MANO EN DIA/MES/AÑO, que es como la teclea media Colombia');

const conFechaTexteada = await armarExcel(ENCABEZADOS, [
  [`XL${marca}2`, `Fecha escrita ${SUFIJO}`, '', '', cargos[0].name, '', area.name, '', '', '', '', '06/01/1998', ''],
  // Y la de la plantilla, que es la recomendada y tiene que seguir entrando igual.
  [`XL${marca}3`, `Fecha ISO ${SUFIJO}`, '', '', cargos[0].name, '', area.name, '', '', '', '', '1998-01-06', ''],
]);

const r2 = await subir(conFechaTexteada, `fechas-texto-${SUFIJO}.xlsx`);
const filas2 = r2.cuerpo?.rows ?? [];
comprobar(
  filas2.every((f) => f.status === 'OK'),
  'las dos formas de escribir la misma fecha entran',
  filas2.map((f) => `${f.documento}:${f.status} ${f.error ?? ''}`).join(' | '),
);

const dosPersonas = await Promise.all(
  [`XL${marca}2`, `XL${marca}3`].map(async (doc) => {
    const encontrada = ((await admin.get(`/users?q=${doc}`)).cuerpo?.items ?? [])[0];
    return encontrada ? (await admin.get(`/users/${encontrada.id}`)).cuerpo : null;
  }),
);
comprobar(
  dosPersonas.every((f) => String(f?.birthDate ?? '').startsWith('1998-01-06')),
  'y las dos guardan EL MISMO dia: 06/01/1998 se lee dia/mes, no mes/dia',
  dosPersonas.map((f) => String(f?.birthDate)).join(' | '),
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(3, 'EL CARGO CON EL NOMBRE LARGO DE VERDAD');

const conCargoLargo = await armarExcel(ENCABEZADOS, [
  [
    `XL${marca}4`,
    `Cargo largo ${SUFIJO}`,
    '',
    '',
    // Se le pone sufijo para no tocar el catalogo real del cliente en dev, pero mide MAS que el
    // tope viejo de 40, que es lo que se esta probando.
    `${CARGO_LARGO} ${SUFIJO}`,
    tiposDeCargo[0]?.name ?? '',
    area.name,
    '',
    '',
    '',
    '',
    '',
    '',
  ],
]);

const r3 = await subir(conCargoLargo, `cargo-largo-${SUFIJO}.xlsx`);
const fila3 = (r3.cuerpo?.rows ?? [])[0];
comprobar(
  fila3?.status === 'OK',
  `un cargo de ${CARGO_LARGO.length} caracteres ya no se rechaza`,
  `quedo ${fila3?.status}: ${fila3?.error}`,
);
comprobar(
  !(fila3?.error ?? '').includes('demasiado largo'),
  'y no sale el "es demasiado largo" que veia el cliente',
  `error: ${fila3?.error}`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(4, 'SIN LA COLUMNA "correo" — opcional como dato, ya no imprescindible como columna');

const sinColumnaCorreo = ENCABEZADOS.filter((h) => h !== 'correo');
const r4 = await subir(
  await armarExcel(sinColumnaCorreo, [
    [`XL${marca}5`, `Sin columna correo ${SUFIJO}`, '', cargos[0].name, '', area.name, '', '', '', '', '', ''],
  ]),
  `sin-correo-${SUFIJO}.xlsx`,
);
comprobar(r4.ok, 'quitar la columna del archivo ya no tumba la carga entera', `import: ${r4.estado} ${JSON.stringify(r4.cuerpo).slice(0, 250)}`);
comprobar((r4.cuerpo?.rows ?? [])[0]?.status === 'OK', 'y la fila entra', `${JSON.stringify((r4.cuerpo?.rows ?? [])[0])}`);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(5, 'LOS ERRORES QUE TUMBAN EL ARCHIVO ENTERO, EN ESPAÑOL Y SIN CODIGOS');

// Sin la columna `area`, que esa SI es imprescindible.
const r5 = await subir(
  await armarExcel(['documento', 'nombre_completo', 'cargo'], [[`XL${marca}6`, 'Quien sea', cargos[0].name]]),
  `faltan-columnas-${SUFIJO}.xlsx`,
);
comprobar(r5.estado === 400, 'falta una columna obligatoria: 400', `estado ${r5.estado}`);
comprobar(
  (r5.cuerpo?.title ?? '').includes('columna') && (r5.cuerpo?.title ?? '').includes('"area"'),
  'y el mensaje dice QUE columna falta, en español',
  `title: ${JSON.stringify(r5.cuerpo?.title)}`,
);
comprobar(
  !/exception/i.test(r5.cuerpo?.title ?? ''),
  'no «Bad Request Exception», que es lo que leyo el cliente',
  `title: ${JSON.stringify(r5.cuerpo?.title)}`,
);

// Un archivo que no es ni .xlsx ni .csv.
const r6 = await subir(Buffer.from('lo que sea'), `plantilla-${SUFIJO}.xls`);
comprobar(r6.estado === 400, 'un .xls (Excel antiguo) se rechaza', `estado ${r6.estado}`);
comprobar(
  (r6.cuerpo?.title ?? '').includes('Guardar como'),
  'diciendo como convertirlo, que es lo unico que hace falta saber',
  `title: ${JSON.stringify(r6.cuerpo?.title)}`,
);

// Un archivo sin filas debajo del encabezado.
const r7 = await subir(await armarExcel(ENCABEZADOS, []), `vacio-${SUFIJO}.xlsx`);
comprobar(r7.estado === 400, 'un archivo sin filas se rechaza', `estado ${r7.estado}`);
comprobar(
  (r7.cuerpo?.title ?? '').includes('ninguna fila'),
  'y lo dice con esas palabras',
  `title: ${JSON.stringify(r7.cuerpo?.title)}`,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(6, 'LA VISTA PREVIA RECORRE EL MISMO CAMINO — y sigue sin escribir nada');

const sim = await subir(
  await armarExcel(ENCABEZADOS, [
    [
      `XL${marca}7`,
      `Solo simulada ${SUFIJO}`,
      '',
      '',
      cargos[0].name,
      '',
      area.name,
      '',
      '',
      '',
      '',
      new Date(Date.UTC(1998, 0, 6)),
      '',
    ],
  ]),
  `simular-${SUFIJO}.xlsx`,
  '/users/import/simular',
);
comprobar(sim.ok, 'la simulacion responde 200 con un .xlsx con fechas', `simular: ${sim.estado} ${JSON.stringify(sim.cuerpo).slice(0, 250)}`);
comprobar(sim.cuerpo?.simulacion === true, 'y se marca como simulacion', `simulacion=${sim.cuerpo?.simulacion}`);
comprobar((sim.cuerpo?.rows ?? [])[0]?.status === 'OK', 'la fila saldria bien', `${JSON.stringify((sim.cuerpo?.rows ?? [])[0])}`);

const noDeberiaEstar = (await admin.get(`/users?q=XL${marca}7`)).cuerpo?.items ?? [];
comprobar(noDeberiaEstar.length === 0, 'y NO se creo a nadie: era una vista previa', `aparecieron ${noDeberiaEstar.length}`);

// ─────────────────────────────────────────────────────────────────────────────────────────────
paso(7, 'LIMPIEZA');

let apagadas = 0;
for (const doc of [`XL${marca}1`, `XL${marca}2`, `XL${marca}3`, `XL${marca}4`, `XL${marca}5`]) {
  const encontrada = ((await admin.get(`/users?q=${doc}`)).cuerpo?.items ?? [])[0];
  if (!encontrada) continue;
  const r = await admin.patch(`/users/${encontrada.id}`, { active: false });
  if (r.ok) apagadas += 1;
}
ok(`${apagadas} persona(s) de prueba desactivadas`);

resumen();
