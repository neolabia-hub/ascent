#!/usr/bin/env node
/**
 * html-a-docx.mjs — convierte los documentos oficiales de entrega a .docx REAL,
 * sin Word y sin ninguna dependencia.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO EXISTE
 *
 * El camino evidente era abrir el HTML con Word por COM y hacer «guardar como».
 * No sirve en esta máquina: Word abre los archivos pero **no puede guardarlos**
 * —falla igual con un documento en blanco—, que es lo que hace un Office sin
 * licencia activa. Y LibreOffice no está instalado.
 *
 * Así que el .docx se escribe aquí, a mano. Un .docx es un ZIP con XML dentro
 * (OOXML), y lo que hace falta para que Word lo abra contento es poco:
 *
 *   [Content_Types].xml        qué tipo es cada parte
 *   _rels/.rels                dónde está el documento principal
 *   word/document.xml          el contenido
 *   word/styles.xml            la tipografía y el tamaño por defecto
 *   word/_rels/document.xml.rels
 *
 * VENTAJA INESPERADA: al no depender de Office, esto corre igual en la máquina
 * de cualquiera y en un servidor de integración continua.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ HTML ENTIENDE
 *
 * NO es un conversor de HTML general, y no debe intentar serlo. Entiende el
 * subconjunto exacto con el que están escritos los documentos oficiales:
 *
 *   bloque : h2 · h3 · p · ul · ol · table.datos · table.rejilla · table.firma
 *            div.nota · div.aviso · table.banda (la portada morada)
 *   línea  : strong · b · em · i · code · br · a · span.hueco
 *
 * Si un día se añade algo distinto a un documento oficial, o se enseña aquí o
 * no sale en el .docx. Es a propósito: un conversor que adivina produce
 * documentos que casi están bien, y «casi» es lo peor que puede estar un acta.
 *
 *   node scripts/html-a-docx.mjs <entrada.html> [más.html ...]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { deflateRawSync, crc32 } from 'node:zlib';

/* ════════════════════════════════════════════════════════════════════════════
   1. UN ANALIZADOR DE HTML DIMINUTO

   Suficiente para el subconjunto de arriba: etiquetas, atributos, texto y las
   vacías (br, meta, link). No maneja etiquetas mal cerradas, y no hace falta:
   los documentos oficiales están bien formados y hay una prueba que lo exige.
   ════════════════════════════════════════════════════════════════════════════ */

const VACIAS = new Set(['br', 'meta', 'link', 'img', 'hr', 'input']);

function analizar(html) {
  const raiz = { etiqueta: '#raiz', atributos: {}, hijos: [] };
  const pila = [raiz];
  let i = 0;

  while (i < html.length) {
    const menor = html.indexOf('<', i);

    if (menor === -1) {
      empujarTexto(pila.at(-1), html.slice(i));
      break;
    }
    if (menor > i) empujarTexto(pila.at(-1), html.slice(i, menor));

    // Comentario
    if (html.startsWith('<!--', menor)) {
      const fin = html.indexOf('-->', menor);
      i = fin === -1 ? html.length : fin + 3;
      continue;
    }
    // Declaración
    if (html.startsWith('<!', menor)) {
      const fin = html.indexOf('>', menor);
      i = fin === -1 ? html.length : fin + 1;
      continue;
    }
    // Cierre
    if (html.startsWith('</', menor)) {
      const fin = html.indexOf('>', menor);
      const nombre = html.slice(menor + 2, fin).trim().toLowerCase();
      for (let n = pila.length - 1; n > 0; n--) {
        if (pila[n].etiqueta === nombre) { pila.length = n; break; }
      }
      i = fin + 1;
      continue;
    }

    // Apertura
    const fin = encontrarFinDeEtiqueta(html, menor);
    const crudo = html.slice(menor + 1, fin);
    const nombre = (crudo.match(/^[a-zA-Z0-9]+/) || [''])[0].toLowerCase();
    const nodo = { etiqueta: nombre, atributos: leerAtributos(crudo), hijos: [] };
    pila.at(-1).hijos.push(nodo);

    // <style> y <script> llevan dentro cosas que no son HTML: se saltan enteros.
    if (nombre === 'style' || nombre === 'script') {
      const cierre = html.toLowerCase().indexOf(`</${nombre}>`, fin);
      i = cierre === -1 ? html.length : cierre + nombre.length + 3;
      continue;
    }

    if (!VACIAS.has(nombre) && !crudo.trimEnd().endsWith('/')) pila.push(nodo);
    i = fin + 1;
  }
  return raiz;
}

// El '>' de dentro de un atributo entrecomillado no cierra la etiqueta.
function encontrarFinDeEtiqueta(html, desde) {
  let comilla = null;
  for (let i = desde + 1; i < html.length; i++) {
    const c = html[i];
    if (comilla) { if (c === comilla) comilla = null; }
    else if (c === '"' || c === "'") comilla = c;
    else if (c === '>') return i;
  }
  return html.length;
}

function leerAtributos(crudo) {
  const atributos = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m;
  while ((m = re.exec(crudo))) atributos[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? '';
  return atributos;
}

function empujarTexto(padre, texto) {
  if (!texto) return;
  padre.hijos.push({ etiqueta: '#texto', texto });
}

const ENTIDADES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', rarr: '→', mdash: '—', ndash: '–',
  laquo: '«', raquo: '»', hellip: '…', bull: '•', deg: '°',
};

function desescapar(t) {
  return t.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (todo, cuerpo) => {
    if (cuerpo[0] === '#') {
      const n = cuerpo[1] === 'x' || cuerpo[1] === 'X'
        ? parseInt(cuerpo.slice(2), 16)
        : parseInt(cuerpo.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : todo;
    }
    return ENTIDADES[cuerpo] ?? todo;
  });
}

const clases = (nodo) => (nodo.atributos?.class || '').split(/\s+/).filter(Boolean);
const tieneClase = (nodo, c) => clases(nodo).includes(c);

function buscar(nodo, predicado, hallados = []) {
  if (predicado(nodo)) hallados.push(nodo);
  for (const h of nodo.hijos || []) buscar(h, predicado, hallados);
  return hallados;
}

function textoPlano(nodo) {
  if (nodo.etiqueta === '#texto') return desescapar(nodo.texto);
  return (nodo.hijos || []).map(textoPlano).join('');
}

/* ════════════════════════════════════════════════════════════════════════════
   2. LA PALETA

   Los mismos valores que el HTML. Escritos aquí otra vez y no importados,
   porque si un día cambia el color de la marca hay que cambiarlo en los dos
   sitios A LA VEZ — y que duela un poco es justo lo que evita que se separen
   sin que nadie lo note.
   ════════════════════════════════════════════════════════════════════════════ */

const C = {
  tinta:     '0B0715',
  texto:     '2B2A33',
  apagado:   '6B6875',
  marca:     '1E0958',
  marcaClara:'C9BCEC',
  etiqueta:  'B9A9E8',
  acento:    'E8734A',
  linea:     'D8D2CA',
  lineaFina: 'CFC8BE',
  cabecera:  'F3F1EC',
  clave:     'F7F5F2',
  notaFondo: 'FFF6F1',
  huecoFondo:'FFF0D6',
  huecoTinta:'6B4A05',
  blanco:    'FFFFFF',
};

const SERIF = 'Georgia';
const SANS  = 'Calibri';
const MONO  = 'Consolas';

const x = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/* ════════════════════════════════════════════════════════════════════════════
   3. DE ÁRBOL HTML A WordprocessingML
   ════════════════════════════════════════════════════════════════════════════ */

/** Un tramo de texto con su formato. */
function tramo(texto, f = {}) {
  if (texto === '\n') return '<w:r><w:br/></w:r>';
  if (!texto) return '';
  const props = [];
  props.push(`<w:rFonts w:ascii="${f.fuente || SANS}" w:hAnsi="${f.fuente || SANS}"/>`);
  if (f.negrita) props.push('<w:b/>');
  if (f.cursiva) props.push('<w:i/>');
  if (f.espaciado) props.push(`<w:spacing w:val="${f.espaciado}"/>`);
  if (f.mayusculas) props.push('<w:caps/>');
  props.push(`<w:color w:val="${f.color || C.texto}"/>`);
  props.push(`<w:sz w:val="${f.tam || 21}"/><w:szCs w:val="${f.tam || 21}"/>`);
  if (f.resaltado) props.push(`<w:shd w:val="clear" w:fill="${f.resaltado}"/>`);
  return `<w:r><w:rPr>${props.join('')}</w:rPr>`
       + `<w:t xml:space="preserve">${x(texto)}</w:t></w:r>`;
}

/** Recorre los hijos de un nodo produciendo tramos con el formato heredado. */
function tramosDe(nodo, f = {}) {
  let salida = '';
  for (const hijo of nodo.hijos || []) {
    if (hijo.etiqueta === '#texto') {
      // El HTML está indentado para leerse; en Word esos saltos son espacios.
      const t = desescapar(hijo.texto).replace(/\s+/g, ' ');
      if (t) salida += tramo(t, f);
      continue;
    }
    switch (hijo.etiqueta) {
      case 'br':     salida += tramo('\n'); break;
      case 'strong':
      case 'b':      salida += tramosDe(hijo, { ...f, negrita: true, color: f.color || C.tinta }); break;
      case 'em':
      case 'i':      salida += tramosDe(hijo, { ...f, cursiva: true }); break;
      case 'code':   salida += tramosDe(hijo, { ...f, fuente: MONO }); break;
      case 'a':      salida += tramosDe(hijo, { ...f, color: '1E0958' }); break;
      case 'span':
        salida += tieneClase(hijo, 'hueco')
          ? tramosDe(hijo, { ...f, negrita: true, color: C.huecoTinta, resaltado: C.huecoFondo })
          : tieneClase(hijo, 'mono')
            ? tramosDe(hijo, { ...f, fuente: MONO, negrita: true, color: C.tinta })
            : tramosDe(hijo, f);
        break;
      case 'small':  salida += tramosDe(hijo, { ...f, tam: 17, color: C.apagado }); break;
      default:       salida += tramosDe(hijo, f);
    }
  }
  return salida;
}

/** Un párrafo. */
function parrafo(contenido, o = {}) {
  const props = [];
  props.push(`<w:spacing w:before="${o.antes ?? 0}" w:after="${o.despues ?? 140}" w:line="276" w:lineRule="auto"/>`);
  if (o.sangria) props.push(`<w:ind w:left="${o.sangria}" w:hanging="${o.colgante ?? 0}"/>`);
  if (o.bordeInferior) props.push(`<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="${o.bordeInferior}"/></w:pBdr>`);
  if (o.bordeIzquierdo) props.push(`<w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="${o.bordeIzquierdo}"/></w:pBdr>`);
  if (o.sombreado) props.push(`<w:shd w:val="clear" w:fill="${o.sombreado}"/>`);
  if (o.juntoAlSiguiente) props.push('<w:keepNext/>');
  if (o.alineacion) props.push(`<w:jc w:val="${o.alineacion}"/>`);
  return `<w:p><w:pPr>${props.join('')}</w:pPr>${contenido}</w:p>`;
}

/** Una tabla. `filas` = [[celda,...]] donde celda = {xml, ancho, fondo, cabecera} */
function tabla(filas, o = {}) {
  const columnas = filas[0]?.length || 1;
  const anchos = filas[0].map((c) => c.ancho || Math.floor(5000 / columnas));

  const borde = o.sinBordes
    ? '<w:tblBorders/>'
    : `<w:tblBorders>
         <w:top w:val="single" w:sz="4" w:color="${C.linea}"/>
         <w:left w:val="single" w:sz="4" w:color="${C.linea}"/>
         <w:bottom w:val="single" w:sz="4" w:color="${C.linea}"/>
         <w:right w:val="single" w:sz="4" w:color="${C.linea}"/>
         <w:insideH w:val="single" w:sz="4" w:color="${C.linea}"/>
         <w:insideV w:val="single" w:sz="4" w:color="${C.linea}"/>
       </w:tblBorders>`;

  const cuerpo = filas.map((fila) => {
    const celdas = fila.map((c, i) => {
      const props = [
        `<w:tcW w:w="${anchos[i]}" w:type="pct"/>`,
        c.fondo ? `<w:shd w:val="clear" w:fill="${c.fondo}"/>` : '',
        `<w:tcMar>
           <w:top w:w="${o.margenCelda ?? 90}" w:type="dxa"/>
           <w:left w:w="${o.margenCeldaLat ?? 120}" w:type="dxa"/>
           <w:bottom w:w="${o.margenCelda ?? 90}" w:type="dxa"/>
           <w:right w:w="${o.margenCeldaLat ?? 120}" w:type="dxa"/>
         </w:tcMar>`,
      ].join('');
      return `<w:tc><w:tcPr>${props}</w:tcPr>${c.xml || parrafo('')}</w:tc>`;
    }).join('');
    // Una fila que se parte entre dos páginas es ilegible en un acta.
    return `<w:tr><w:trPr><w:cantSplit/></w:trPr>${celdas}</w:tr>`;
  }).join('');

  return `<w:tbl><w:tblPr>
    <w:tblW w:w="5000" w:type="pct"/>
    ${borde}
    <w:tblCellMar/>
  </w:tblPr><w:tblGrid>${anchos.map(() => '<w:gridCol/>').join('')}</w:tblGrid>${cuerpo}</w:tbl>`;
}

/** Lee `width:NN%` del estilo de una celda y lo pasa a la escala de Word (pct/50). */
function anchoDe(celda) {
  const m = (celda.atributos?.style || '').match(/width\s*:\s*(\d+(?:\.\d+)?)%/);
  return m ? Math.round(parseFloat(m[1]) * 50) : null;
}

/* ── Los bloques ─────────────────────────────────────────────────────────── */

function bloqueBanda(nodo) {
  const trozo = (clase) => {
    const n = buscar(nodo, (h) => tieneClase(h, clase))[0];
    return n ? textoPlano(n).replace(/\s+/g, ' ').trim() : '';
  };
  // El <br> del título se conserva: parte el titular donde está pensado.
  const nodoTitulo = buscar(nodo, (h) => tieneClase(h, 'banda-titulo'))[0];

  const dentro = [
    parrafo(tramo(trozo('banda-marca').toUpperCase(),
      { fuente: SERIF, negrita: true, tam: 30, color: C.blanco, espaciado: 100 }),
      { despues: 40 }),
    parrafo(tramo(trozo('banda-etiqueta').toUpperCase(),
      { tam: 16, color: C.etiqueta, espaciado: 40 }),
      { despues: 320 }),
    parrafo(nodoTitulo ? tramosDe(nodoTitulo, { fuente: SERIF, tam: 52, color: C.blanco }) : '',
      { despues: 160 }),
    parrafo(tramo(trozo('banda-bajada'), { tam: 21, color: C.marcaClara }), { despues: 0 }),
  ].join('');

  return tabla([[{ xml: dentro, fondo: C.marca, ancho: 5000 }]], {
    sinBordes: true, margenCelda: 460, margenCeldaLat: 460,
  });
}

function bloqueTabla(nodo) {
  const filas = buscar(nodo, (h) => h.etiqueta === 'tr');
  if (!filas.length) return '';

  const datos = filas.map((fila) =>
    (fila.hijos || []).filter((c) => c.etiqueta === 'td' || c.etiqueta === 'th').map((celda) => {
      const esCabecera = celda.etiqueta === 'th';
      const esClave = tieneClase(celda, 'clave');
      const formato = esCabecera
        ? { negrita: true, tam: 17, color: '5B5866', mayusculas: true, espaciado: 20 }
        : esClave
          ? { negrita: true, tam: 20, color: C.tinta }
          : { tam: 20 };

      // Una celda puede llevar párrafos dentro (la de las firmas) o texto suelto.
      const parrafosDentro = (celda.hijos || []).filter((h) => h.etiqueta === 'p');
      const xml = parrafosDentro.length
        ? parrafosDentro.map((p, i) => parrafo(tramosDe(p, formato), {
            despues: i === parrafosDentro.length - 1 ? 0 : 100,
          })).join('')
        : parrafo(tramosDe(celda, formato), { despues: 0 });

      return {
        xml,
        ancho: anchoDe(celda),
        fondo: esCabecera ? C.cabecera : esClave ? C.clave : null,
      };
    }));

  return tabla(datos, { sinBordes: tieneClase(nodo, 'firma') });
}

function bloqueAviso(nodo) {
  const dentro = (nodo.hijos || [])
    .filter((h) => h.etiqueta === 'p')
    .map((p, i, todos) => parrafo(tramosDe(p, { tam: 20 }), { despues: i === todos.length - 1 ? 0 : 120 }))
    .join('');
  return tabla([[{ xml: dentro, fondo: C.notaFondo, ancho: 5000 }]], {
    sinBordes: true, margenCelda: 160, margenCeldaLat: 200,
  });
}

function bloqueLista(nodo, ordenada) {
  const puntos = (nodo.hijos || []).filter((h) => h.etiqueta === 'li');
  return puntos.map((li, i) => {
    const marca = ordenada ? `${i + 1}.` : '•';
    return parrafo(
      tramo(`${marca}  `, { negrita: ordenada, color: ordenada ? C.tinta : C.acento, tam: 20 })
        + tramosDe(li, { tam: 20 }),
      { sangria: 360, colgante: 200, despues: 90 },
    );
  }).join('');
}

/** Recorre el cuerpo y devuelve el XML del documento. */
function convertirCuerpo(nodo, salida = []) {
  for (const hijo of nodo.hijos || []) {
    if (hijo.etiqueta === '#texto') continue;

    switch (hijo.etiqueta) {
      case 'h2':
        salida.push(parrafo(
          tramosDe(hijo, { fuente: SERIF, tam: 30, color: C.tinta, negrita: true }),
          { antes: 380, despues: 120, bordeInferior: C.lineaFina, juntoAlSiguiente: true },
        ));
        break;
      case 'h3':
        salida.push(parrafo(
          tramosDe(hijo, { fuente: SERIF, tam: 23, color: C.tinta, negrita: true }),
          { antes: 240, despues: 60, juntoAlSiguiente: true },
        ));
        break;
      case 'p': {
        const contenido = tramosDe(hijo, { tam: 21 });
        // El pie de página del documento va más pequeño y con línea encima.
        const esPie = (hijo.atributos?.style || '').includes('font-size:8.5pt');
        salida.push(esPie
          ? parrafo(tramosDe(hijo, { tam: 16, color: '8A8794' }), { antes: 480, despues: 0 })
          : parrafo(contenido, { despues: 150 }));
        break;
      }
      case 'ul': salida.push(bloqueLista(hijo, false)); break;
      case 'ol': salida.push(bloqueLista(hijo, true)); break;
      case 'div':
        if (tieneClase(hijo, 'nota') || tieneClase(hijo, 'aviso')) salida.push(bloqueAviso(hijo));
        else convertirCuerpo(hijo, salida);
        break;
      case 'table':
        if (tieneClase(hijo, 'banda')) salida.push(bloqueBanda(hijo));
        else if (tieneClase(hijo, 'datos') || tieneClase(hijo, 'rejilla') || tieneClase(hijo, 'firma')) {
          salida.push(bloqueTabla(hijo));
          salida.push(parrafo('', { despues: 100 })); // aire tras la tabla
        } else convertirCuerpo(hijo, salida); // tabla de maquetación: se atraviesa
        break;
      case 'tr': case 'td': case 'tbody': case 'thead':
        convertirCuerpo(hijo, salida);
        break;
      default:
        convertirCuerpo(hijo, salida);
    }
  }
  return salida;
}

/* ════════════════════════════════════════════════════════════════════════════
   4. EL PAQUETE .docx
   ════════════════════════════════════════════════════════════════════════════ */

function documentoXml(cuerpo) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${cuerpo}
<w:sectPr>
  <w:pgSz w:w="12240" w:h="15840"/>
  <w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"
           w:header="708" w:footer="708" w:gutter="0"/>
</w:sectPr>
</w:body></w:document>`;
}

// Carta (12240 × 15840 twips) y no A4: es el tamaño de papel de Colombia.

const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr>
    <w:rFonts w:ascii="${SANS}" w:hAnsi="${SANS}"/>
    <w:sz w:val="21"/><w:szCs w:val="21"/>
    <w:color w:val="${C.texto}"/>
  </w:rPr></w:rPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
  </w:style>
</w:styles>`;

const TIPOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`;

const RELS_RAIZ = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`;

const RELS_DOC = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const propiedades = (titulo) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties
  xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${x(titulo)}</dc:title>
  <dc:creator>AION — Ascent</dc:creator>
  <cp:lastModifiedBy>AION — Ascent</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created>
</cp:coreProperties>`;

/* ── ZIP, con lo justo ───────────────────────────────────────────────────── */

function escribirZip(entradas) {
  const locales = [];
  const central = [];
  let desplazamiento = 0;

  for (const { nombre, datos } of entradas) {
    const crudo = Buffer.from(datos, 'utf8');
    const comprimido = deflateRawSync(crudo);
    const suma = crc32(crudo) >>> 0;
    const nom = Buffer.from(nombre, 'utf8');

    const cabecera = Buffer.alloc(30);
    cabecera.writeUInt32LE(0x04034b50, 0);
    cabecera.writeUInt16LE(20, 4);          // versión necesaria
    cabecera.writeUInt16LE(0, 6);           // banderas
    cabecera.writeUInt16LE(8, 8);           // método: deflate
    cabecera.writeUInt16LE(0, 10);          // hora
    cabecera.writeUInt16LE(0x2821, 12);     // fecha (2000-01-01, fija: sale igual siempre)
    cabecera.writeUInt32LE(suma, 14);
    cabecera.writeUInt32LE(comprimido.length, 18);
    cabecera.writeUInt32LE(crudo.length, 22);
    cabecera.writeUInt16LE(nom.length, 26);
    cabecera.writeUInt16LE(0, 28);
    locales.push(cabecera, nom, comprimido);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0, 8);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt16LE(0, 12);
    dir.writeUInt16LE(0x2821, 14);
    dir.writeUInt32LE(suma, 16);
    dir.writeUInt32LE(comprimido.length, 20);
    dir.writeUInt32LE(crudo.length, 24);
    dir.writeUInt16LE(nom.length, 28);
    dir.writeUInt32LE(desplazamiento, 42);
    central.push(dir, nom);

    desplazamiento += cabecera.length + nom.length + comprimido.length;
  }

  const cuerpoCentral = Buffer.concat(central);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(entradas.length, 8);
  fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(cuerpoCentral.length, 12);
  fin.writeUInt32LE(desplazamiento, 16);

  return Buffer.concat([...locales, cuerpoCentral, fin]);
}

/* ════════════════════════════════════════════════════════════════════════════
   5. PUESTA EN MARCHA
   ════════════════════════════════════════════════════════════════════════════ */

const entradas = process.argv.slice(2);
if (!entradas.length) {
  console.error('Uso: node scripts/html-a-docx.mjs <entrada.html> [más.html ...]');
  process.exit(1);
}

for (const ruta of entradas) {
  const html = readFileSync(ruta, 'utf8');
  const arbol = analizar(html);

  const titulo = (html.match(/<title>([^<]*)<\/title>/i)?.[1] || basename(ruta)).trim();
  const cuerpo = buscar(arbol, (n) => n.etiqueta === 'body')[0] || arbol;

  const bloques = convertirCuerpo(cuerpo).join('');
  if (!bloques.trim()) {
    console.error(`  ${basename(ruta)}: no se produjo contenido — revisar el HTML`);
    process.exit(1);
  }

  const docx = escribirZip([
    { nombre: '[Content_Types].xml',       datos: TIPOS },
    { nombre: '_rels/.rels',               datos: RELS_RAIZ },
    { nombre: 'docProps/core.xml',         datos: propiedades(titulo) },
    { nombre: 'word/_rels/document.xml.rels', datos: RELS_DOC },
    { nombre: 'word/document.xml',         datos: documentoXml(bloques) },
    { nombre: 'word/styles.xml',           datos: ESTILOS },
  ]);

  const salida = join(dirname(ruta), basename(ruta).replace(/\.html?$/i, '.docx'));
  writeFileSync(salida, docx);
  console.log(`  ${basename(salida)}  ${(docx.length / 1024).toFixed(1)} KB`);
}
