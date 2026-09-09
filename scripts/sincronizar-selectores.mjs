import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * QUE LOS SELECTORES DE LAS PRUEBAS DIGAN LO QUE DICE LA PANTALLA.
 *
 * ─── PARA QUE SIRVE ───
 *
 * Se corrigen los rótulos de la interfaz —una tilde, una palabra mejor— y la suite se pone roja.
 * Ninguno de esos rojos es una regresión: son pruebas citando una pantalla que ya no existe, porque
 * buscan por texto (`getByRole('button', { name: 'Quienes' })`). Pasó tres veces en la misma semana,
 * y cada vez costó media hora separar el rojo de vocabulario del rojo de verdad.
 *
 * Se ejecuta **con el cambio de la web ya hecho y sin confirmar**, desde la raíz:
 *
 *     node scripts/sincronizar-selectores.mjs
 *
 * Lee el `git diff` de `apps/web/src`, saca las cadenas que cambiaron **de verdad** y sustituye esas
 * mismas, literales, en `e2e/` y `scripts/recorridos/`. Lo que no cambió en la pantalla no se toca
 * en la prueba — que es justo lo que hace mal la alternativa obvia (volver a pasar el diccionario
 * de tildes por encima de los `.spec.ts`, que corrige también lo que a propósito se quedó sin tilde
 * y desincroniza en la dirección contraria).
 *
 * ─── LAS CUATRO TRAMPAS, TODAS PISADAS ANTES DE ESQUIVARLAS ───
 *
 *  1. **Emparejar por posición cruza cadenas.** La primera versión propuso `Escape -> Enter`: esa
 *     línea había cambiado dos cosas a la vez. Se exige que las dos formas sean la misma palabra
 *     sin acentos; cualquier otro cambio de texto se sincroniza a mano, que es cuando toca mirarlo.
 *  2. **Un rótulo y una función se escriben igual.** Sustituir en todo el archivo convirtió
 *     `montarFormacion` en `montarFormación`. Solo se toca lo que va dentro de comillas.
 *  3. **Dentro de las comillas también hay código.** En una plantilla, `${reglaArea.estado}` es una
 *     variable, y la tercera versión la renombró igual. Se saltan los tramos `${...}`.
 *  4. **Una palabra puede ser el principio de otra.** `Area` es un trozo de `Areas completas`, un
 *     rótulo que NO cambió — y la prueba dejó de encontrarlo justo por «arreglarlo». Se exige
 *     palabra entera.
 *
 * ─── LA FRONTERA QUE ESTE SCRIPT NO CRUZA ───
 *
 * Los nombres de catálogo —«Gestion Humana», «Capacitacion del plan»— son **datos del tenant**, no
 * rótulos del producto (Decisión #164). Viven en la base, la suite corre contra la de desarrollo
 * **sin volver a sembrarla**, y acentuarlos en el código solo rompería el selector. Como no
 * aparecen en el diff de la web no entran aquí; si alguno se cuela, se revierte a mano.
 *
 * ─── COMPROBACION OBLIGATORIA DESPUES ───
 *
 *     git diff e2e scripts/recorridos | grep "^+" | grep -v "['\"`]"
 *
 * Si sale algo, se tocó código y no un selector. Las tres versiones malas pasaban el typecheck.
 */
const pelado = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');
const literales = (linea) => [...linea.matchAll(/'([^'\n]{4,})'/g)].map((m) => m[1]);
const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/*
  NOMBRES DE CATALOGO: ESTOS NO SE SINCRONIZAN NUNCA (Decision #164).

  Son DATOS del tenant, guardados en la base, no rotulos del producto. Aparecen en el diff de la web
  cuando alguna pantalla los usa de texto de ejemplo —el disenador de constancias los escribe para
  enseñar como quedara el papel—, y de ahi se colaban aqui. Pero la suite corre contra la base de
  desarrollo SIN volver a sembrarla: la prueba tiene que pedirlos como estan GUARDADOS, sin tilde, o
  el `selectOption({ label })` no encuentra nada.

  Paso dos veces —la segunda despues de haberlo documentado—, asi que deja de ser una nota y pasa a
  ser una lista.
*/
const NOMBRES_DE_CATALOGO = ['Capacitacion del plan', 'Capacitacion extraordinaria', 'Gestion Humana', 'Formacion'];

const diff = execSync('git diff -U0 -- apps/web/src', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const cambios = new Map();
const lineas = diff.split('\n');
for (let i = 0; i < lineas.length; i += 1) {
  if (!lineas[i].startsWith('-') || lineas[i].startsWith('---')) continue;
  const quitadas = [];
  while (lineas[i]?.startsWith('-') && !lineas[i].startsWith('---')) quitadas.push(lineas[i++].slice(1));
  const puestas = [];
  while (lineas[i]?.startsWith('+') && !lineas[i].startsWith('+++')) puestas.push(lineas[i++].slice(1));
  for (let j = 0; j < Math.min(quitadas.length, puestas.length); j += 1) {
    const antes = literales(quitadas[j]);
    const despues = literales(puestas[j]);
    if (antes.length !== despues.length) continue;
    for (let k = 0; k < antes.length; k += 1) {
      if (antes[k] === despues[k] || pelado(antes[k]) !== pelado(despues[k])) continue;
      if (NOMBRES_DE_CATALOGO.some((nombre) => antes[k].includes(nombre))) continue;
      cambios.set(antes[k], despues[k]);
    }
  }
  i -= 1;
}

/** Los tramos de una línea que van entre comillas, para no salirse de ellos. */
function dentroDeComillas(linea) {
  const tramos = [];
  let comilla = null;
  let inicio = 0;
  for (let i = 0; i < linea.length; i += 1) {
    if (linea[i - 1] === '\\') continue;
    const c = linea[i];
    if (comilla === null && (c === "'" || c === '"' || c === '`')) {
      comilla = c;
      inicio = i + 1;
    } else if (c === comilla) {
      tramos.push([inicio, i]);
      comilla = null;
    }
  }
  return tramos;
}

/** El texto de una plantilla, dejando fuera lo que va dentro de `${...}`, que es código. */
const soloProsa = (trozo, sustituir) =>
  trozo
    .split(/(\$\{[^}]*\})/)
    .map((parte) => (parte.startsWith('${') ? parte : sustituir(parte)))
    .join('');

const ES_COMENTARIO = (linea) => /^\s*(\/\/|\/?\*)/.test(linea);

function archivos(dir) {
  const salida = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...archivos(ruta));
    else if (/\.(ts|mjs)$/.test(ruta)) salida.push(ruta);
  }
  return salida;
}

let tocados = 0;
const aplicados = new Set();
for (const ruta of [...archivos('e2e'), ...archivos('scripts/recorridos')]) {
  const original = readFileSync(ruta, 'utf8');
  const salida = original
    .split('\n')
    .map((linea) => {
      if (ES_COMENTARIO(linea)) return linea;
      const tramos = dentroDeComillas(linea);
      if (tramos.length === 0) return linea;
      let fuera = '';
      let cursor = 0;
      for (const [desde, hasta] of tramos) {
        fuera += linea.slice(cursor, desde);
        fuera += soloProsa(linea.slice(desde, hasta), (parte) => {
          /*
            Y LA MISMA LISTA, TAMBIEN AL APLICAR. No basta con no registrar el par: `Gestion` sale
            como par por su cuenta —es un rotulo del panel de permisos— y luego encaja dentro de
            «Gestion Humana», que es el nombre de un area guardado en la base. Se descarta la cadena
            entera en cuanto contiene un nombre de catalogo.
          */
          if (NOMBRES_DE_CATALOGO.some((nombre) => parte.includes(nombre))) return parte;
          let nueva = parte;
          for (const [antes, despues] of cambios) {
            const limite = new RegExp(`(?<!\\p{L})${escapar(antes)}(?!\\p{L})`, 'gu');
            if (!limite.test(nueva)) continue;
            nueva = nueva.replace(limite, despues);
            aplicados.add(`${antes} -> ${despues}`);
          }
          return nueva;
        });
        cursor = hasta;
      }
      return fuera + linea.slice(cursor);
    })
    .join('\n');
  if (salida !== original) {
    writeFileSync(ruta, salida);
    tocados += 1;
  }
}

console.log([...aplicados].map((l) => '  ' + l.slice(0, 110)).join('\n'));
console.log(
  `\n${cambios.size} cadenas cambiadas en la web; ${aplicados.size} aparecian en pruebas; ${tocados} archivos sincronizados`,
);
