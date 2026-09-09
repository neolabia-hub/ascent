import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * SELECTORES QUE PIDEN UN TEXTO QUE LA PANTALLA NO DICE.
 *
 * Sale de un fallo real: cinco specs pedian el boton «Nueva lección» y el boton decia «Nueva
 * leccion», **en el mismo commit**. Paso porque una pasada de tildes se aplico a los dos lados y
 * luego solo el lado de la web se revirtio (`git checkout -- apps/web/src`); las pruebas se
 * quedaron citando una pantalla que dejo de existir, y el rojo parecia una regresion.
 *
 * Esto compara los dos lados sin correr nada: coge las cadenas con acento que aparecen dentro de un
 * selector por texto (`getByRole`, `getByText`, `getByLabel`, `getByPlaceholder`) y comprueba que
 * esa cadena exista, literal, en `apps/web/src`. Lo que no aparezca sale listado.
 *
 * Falsos positivos posibles y por que se aceptan: un rotulo compuesto en tiempo de ejecucion
 * (`{tipo} vencida`) no esta literal en el codigo y saldra aqui. Son pocos y se reconocen de un
 * vistazo; el coste de revisarlos es mucho menor que el de una suite roja por vocabulario.
 */
const SELECTOR = /get(?:By|ByRole|ByText|ByLabel|ByPlaceholder)?\w*\([^)]*?['"`]([^'"`\n]{4,})['"`]/g;
const NAME = /name:\s*['"`]([^'"`\n]{4,})['"`]/g;
const TIENE_ACENTO = /[áéíóúñÁÉÍÓÚÑ]/;

function archivos(dir, ext) {
  const salida = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...archivos(ruta, ext));
    else if (ext.test(ruta)) salida.push(ruta);
  }
  return salida;
}

const web = archivos('apps/web/src', /\.tsx?$/)
  .map((r) => readFileSync(r, 'utf8'))
  .join('\n');

const huerfanos = new Map();
for (const ruta of archivos('e2e', /\.spec\.ts$/)) {
  const texto = readFileSync(ruta, 'utf8');
  for (const re of [SELECTOR, NAME]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(texto)) !== null) {
      const buscado = m[1];
      if (!TIENE_ACENTO.test(buscado)) continue;
      if (web.includes(buscado)) continue;
      const linea = texto.slice(0, m.index).split('\n').length;
      if (!huerfanos.has(buscado)) huerfanos.set(buscado, []);
      huerfanos.get(buscado).push(`${ruta.split(/[\\/]/).pop()}:${linea}`);
    }
  }
}

if (huerfanos.size === 0) {
  console.log('Todos los selectores con acento existen en la pantalla.');
} else {
  for (const [texto, sitios] of huerfanos) {
    console.log(`  "${texto}"\n      ${[...new Set(sitios)].join(', ')}`);
  }
  console.log(`\n${huerfanos.size} texto(s) que las pruebas piden y la pantalla no dice.`);
}

/*
  SEGUNDA COMPROBACION: EL ROTULO QUE EXISTE EN LAS DOS FORMAS.

  La primera se le escapo «Nueva evaluación», y el motivo enseña algo: la cadena SI estaba en el
  codigo —como titulo del cajon que se abre— mientras el BOTON que hay que pulsar decia «Nueva
  evaluacion», sin tilde. Buscar la cadena en todo el fichero da por bueno un desfase que solo
  existe en un sitio concreto.

  Asi que se busca la señal contraria, que no tiene ese punto ciego: si la prueba pide una forma con
  tilde y la pantalla escribe **tambien** la forma sin ella, hay dos rotulos para lo mismo y uno de
  los dos esta mal. Encontro los cuatro que faltaban («Nueva evaluación», «Asignar formación»,
  «Configuración», «Quiénes») de una pasada.
*/
const pelado = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');
const gemelos = new Map();
for (const ruta of archivos('e2e', /\.spec\.ts$/)) {
  const texto = readFileSync(ruta, 'utf8');
  NAME.lastIndex = 0;
  let m;
  while ((m = NAME.exec(texto)) !== null) {
    const buscado = m[1];
    if (!TIENE_ACENTO.test(buscado)) continue;
    const sinTilde = pelado(buscado);
    if (sinTilde === buscado || !web.includes(sinTilde)) continue;
    if (!gemelos.has(buscado)) gemelos.set(buscado, new Set());
    gemelos.get(buscado).add(ruta.split(/[\\/]/).pop());
  }
}

if (gemelos.size > 0) {
  console.log('\nY estos existen en la pantalla en LAS DOS formas, con tilde y sin ella:');
  for (const [texto, sitios] of gemelos) {
    console.log(`  "${texto}"  <-  tambien se escribe "${pelado(texto)}"   [${[...sitios].join(', ')}]`);
  }
}

/*
  TERCERA COMPROBACION: LA PRUEBA PIDE SIN TILDE LO QUE LA PANTALLA ESCRIBE CON ELLA.

  Las dos de arriba solo miran los textos CON acento que piden las pruebas, y ese era su punto
  ciego: el desfase mas comun despues de una pasada de tildes es el CONTRARIO —la pantalla gano la
  tilde y el selector se quedo sin ella—. Asi se quedaron rojas «Buenos dias» (la pantalla dice
  «Buenos días»), «Version 1» (dice «Versión 1») y «Seleccion unica» (dice «Selección única») sin
  que ninguna de las dos comprobaciones dijera nada.

  Se mira tambien dentro de las EXPRESIONES REGULARES, que es donde se escondian dos de las tres:
  las dos primeras solo leen cadenas entre comillas.

  Como funciona: si lo que pide la prueba no esta literal en la web pero SI aparece con la pantalla
  pelada de tildes, se saca del codigo el trozo equivalente y se propone. Es la correccion exacta,
  no una sugerencia.
*/
const REGEX = /(?:getBy\w+|toContainText|hasText:|name:)\s*\(?\s*\/([^/\n]{4,})\//g;
// Pelado CARACTER A CARACTER: `pelado()` pasa por NFD y cambia la longitud, asi que los indices
// dejarian de cuadrar y el trozo propuesto saldria corrido. Aqui hace falta que cuadren.
const pelaAlineado = (t) => t.replace(/[áéíóúüñÁÉÍÓÚÜÑ]/g, (c) => "aeiounAEIOUUN"["áéíóúüñÁÉÍÓÚÜÑ".indexOf(c)]);
const webPelada = pelaAlineado(web);
const sinTilde = new Map();

function revisar(buscado, ruta, linea) {
  if (TIENE_ACENTO.test(buscado)) return;
  if (web.includes(buscado)) return;
  const donde = webPelada.indexOf(buscado);
  if (donde === -1) return;
  const conTilde = web.slice(donde, donde + buscado.length);
  if (conTilde === buscado) return;
  const clave = `${buscado}  ->  ${conTilde}`;
  if (!sinTilde.has(clave)) sinTilde.set(clave, new Set());
  sinTilde.get(clave).add(`${ruta.split(/[\/]/).pop()}:${linea}`);
}

for (const ruta of archivos('e2e', /\.(spec|ts)$/)) {
  const texto = readFileSync(ruta, 'utf8');
  for (const re of [SELECTOR, NAME]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(texto)) !== null) {
      revisar(m[1], ruta, texto.slice(0, m.index).split('\n').length);
    }
  }
  REGEX.lastIndex = 0;
  let m;
  while ((m = REGEX.exec(texto)) !== null) {
    const linea = texto.slice(0, m.index).split('\n').length;
    // Cada alternativa por separado, y solo las que son texto llano: con `\d`, `.*` o corchetes
    // dentro, el trozo que se compare no es lo que la pantalla escribe.
    for (const trozo of m[1].split('|')) {
      const limpio = trozo.replace(/^\^/, '').replace(/\$$/, '');
      if (/[\[\]().*+?{}]/.test(limpio)) continue;
      if (limpio.trim().length >= 4) revisar(limpio, ruta, linea);
    }
  }
}

if (sinTilde.size > 0) {
  console.log('\nY estos los pide la prueba SIN tilde y la pantalla los escribe CON ella:');
  for (const [par, sitios] of sinTilde) {
    console.log(`  ${par}   [${[...sitios].join(', ')}]`);
  }
  console.log(`\n${sinTilde.size} selector(es) que hay que corregir en las pruebas.`);
}
