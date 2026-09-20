import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import type { CampoConstancia, CertificateFields, FirmanteConstancia } from '@neo-pulse/shared';
import type { CertificateSnapshot } from './certificate-snapshot.js';

/**
 * DIBUJA LA CONSTANCIA (Decision #112).
 *
 * ─── SIN NAVEGADOR ───
 *
 * Lo alternativo era Chromium headless renderizando HTML. Se descarto: ~300 MB de dependencia y
 * varios segundos por documento en el servidor de 1 vCPU que hay, para algo que aqui se resuelve
 * en milisegundos. Y sobre todo, HTML escrito por un cliente y ejecutado por nuestro servidor es
 * superficie de ataque —una imagen apuntando a la red interna es una peticion hecha desde dentro—.
 *
 * Aqui el cliente sube su ARTE y nosotros escribimos encima. Nada que interpretar.
 *
 * ─── TODO SALE DEL SNAPSHOT ───
 *
 * Ni una consulta a la base de datos mientras se dibuja. Una constancia es un documento con fecha:
 * si se armara leyendo las tablas de hoy, reimprimirla dentro de dos años daria un papel distinto
 * —la persona cambio de cargo, la formacion se renombro, quien respondia se jubilo— y eso invalida
 * la evidencia. Ver `certificate-snapshot.ts`.
 */

/** A4 en puntos PDF (72 por pulgada). El tamaño de hoja que usa todo el mundo aqui. */
const A4_LARGO = 841.89;
const A4_CORTO = 595.28;

export interface DatosParaDibujar {
  snapshot: CertificateSnapshot;
  serialNumber: string;
  verificationCode: string;
  fields: CertificateFields;
  signers: FirmanteConstancia[];
  landscape: boolean;
  /** El arte de fondo, ya leido del almacen. `null` = hoja blanca. */
  background: Buffer | null;
  /** Las firmas, en el mismo orden que `signers`. `null` donde no haya imagen. */
  signatureImages: Array<Buffer | null>;
  /** El QR ya rasterizado a PNG. Se genera fuera para que esta funcion siga siendo sincrona. */
  qrPng: Buffer | null;
  /**
   * Hasta cuando acredita. NO va en el snapshot y por eso llega aparte: el snapshot congela lo que
   * PASO —quien, que, cuando— y el vencimiento es una consecuencia que vive en la fila, junto a la
   * revocacion. Si estuviera congelado, corregir una vigencia mal puesta exigiria reescribir el
   * documento en vez de la fila.
   */
  validUntil: Date | null;
}

export async function dibujarConstancia(datos: DatosParaDibujar): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const ancho = datos.landscape ? A4_LARGO : A4_CORTO;
  const alto = datos.landscape ? A4_CORTO : A4_LARGO;
  const page = pdf.addPage([ancho, alto]);

  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);

  /*
    EL FONDO A SANGRE, deformando si hace falta.

    Se valoro respetar la proporcion del arte y centrarlo, y es peor: dejaria franjas blancas
    arriba y abajo en una constancia que el cliente diseño para ocupar la hoja entera, y esas
    franjas se ven como un error de impresion. Si el arte viene con otra proporcion, lo que hay que
    arreglar es el arte —y se ve al momento en la vista previa—, no repartir el problema.
  */
  if (datos.background) {
    const imagen = await incrustarImagen(pdf, datos.background);
    if (imagen) page.drawImage(imagen, { x: 0, y: 0, width: ancho, height: alto });
  }

  const valores = valoresDe(datos);

  for (const [clave, valor] of Object.entries(valores)) {
    const campo = datos.fields[clave as keyof CertificateFields];
    // Un campo sin colocar o apagado no se dibuja; un valor vacio tampoco, para no dejar una
    // etiqueta suelta encima del arte.
    if (!campo || campo.visible === false || !valor) continue;
    escribir(page, valor, campo, { ancho, alto, normal, negrita });
  }

  // EL QR va aparte: no es texto, es el codigo de verificacion para comprobarlo con el telefono
  // sin teclear veinte caracteres a mano.
  const campoQr = datos.fields.qr;
  if (campoQr && campoQr.visible !== false && datos.qrPng) {
    const imagen = await pdf.embedPng(datos.qrPng).catch(() => null);
    if (imagen) {
      const lado = (campoQr.size / 100) * alto;
      page.drawImage(imagen, {
        x: (campoQr.x / 100) * ancho - lado / 2,
        y: alto - (campoQr.y / 100) * alto - lado / 2,
        width: lado,
        height: lado,
      });
    }
  }

  for (const [indice, firmante] of datos.signers.entries()) {
    await dibujarFirma(pdf, page, firmante, datos.signatureImages[indice] ?? null, { ancho, alto, normal });
  }

  return pdf.save();
}

/**
 * LO QUE VA EN CADA CAMPO, ya formateado para imprimir.
 *
 * Devuelve cadena VACIA donde no hay dato, nunca "null" ni "-": un guion impreso en una constancia
 * oficial se lee como que falta algo. Si no hay nota porque no hubo examen, el campo simplemente
 * no se dibuja.
 */
function valoresDe(datos: DatosParaDibujar): Record<string, string> {
  const { snapshot } = datos;
  const completado = new Date(snapshot.resultado.completedAt);

  const enLetra = (fecha: Date) =>
    fecha.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });

  return {
    nombre: snapshot.persona.fullName,
    documento: `${snapshot.persona.documentType} ${snapshot.persona.documentNumber}`,
    cargo: snapshot.persona.jobTitle ?? '',
    area: snapshot.persona.area ?? '',
    formacion: snapshot.formacion.name,
    tipo: snapshot.formacion.typeName ?? '',
    horas: snapshot.formacion.hours ? `${snapshot.formacion.hours} horas` : '',
    // Solo se escribe si vence. En lo que no vence, imprimir "Vence: —" sugiere que falta un dato.
    vence: datos.validUntil ? `Vigente hasta el ${enLetra(datos.validUntil)}` : '',
    // En letra y no en numeros: "3 de marzo de 2026" no se puede leer al reves, y 03/04/2026 si.
    fecha: enLetra(completado),
    serial: datos.serialNumber,
    codigo: datos.verificationCode,
    nota: snapshot.resultado.scorePct === null ? '' : `Calificacion: ${snapshot.resultado.scorePct}%`,
    /**
     * QUE MODULOS COMPONEN EL PROGRAMA (2026-09-15). Solo tiene algo que decir en una constancia
     * DE PROGRAMA: `emitirPorPrograma` guarda ahi la lista `[{name}, ...]` de los modulos
     * aprobados. En una constancia de formacion suelta, `syllabus` es el temario publicado —otra
     * forma— y este campo sale vacio, que es lo correcto: no hay "modulos" que listar.
     */
    modulos: modulosDe(snapshot.formacion.syllabus),
  };
}

/** Une los nombres de modulo en un texto de varias lineas, o vacio si el temario no tiene esa forma. */
function modulosDe(syllabus: unknown): string {
  if (!Array.isArray(syllabus)) return '';
  const nombres = syllabus
    .map((item) => (item && typeof item === 'object' && 'name' in item ? String((item as { name: unknown }).name) : null))
    .filter((n): n is string => n !== null);
  return nombres.join('\n');
}

function escribir(
  page: PDFPage,
  texto: string,
  campo: CampoConstancia,
  ctx: { ancho: number; alto: number; normal: PDFFont; negrita: PDFFont },
): void {
  const fuente = campo.bold ? ctx.negrita : ctx.normal;
  const tamano = (campo.size / 100) * ctx.alto;

  /*
    LA Y SE INVIERTE AQUI, y solo aqui. La plantilla se guarda con origen ARRIBA-IZQUIERDA porque
    es como piensa quien arrastra los campos en la pantalla; el PDF cuenta desde abajo. Hacer la
    conversion en el unico sitio que dibuja es lo que permite que el resto del sistema —la pantalla
    de colocacion, la vista previa, el JSON guardado— hable un solo idioma.

    Se resta el tamaño de la letra porque la Y del campo es donde empieza el texto por ARRIBA, que
    es lo que se ve al colocarlo; pdf-lib dibuja desde la linea base.
  */
  const yInicial = ctx.alto - (campo.y / 100) * ctx.alto - tamano;
  /*
    VARIAS LINEAS, para el unico campo que las necesita ("modulos"): el resto siempre trae una
    sola, y un salto de linea que no existe no mueve nada. 1.3 es el interlineado de siempre en
    tipografia impresa — cabe respirar entre renglones sin que la lista de modulos ocupe el doble.
  */
  const lineas = texto.split('\n');
  lineas.forEach((linea, indice) => {
    const anchoTexto = fuente.widthOfTextAtSize(linea, tamano);
    // `center` es el caso util: un nombre largo y uno corto quedan igual de bien puestos bajo la
    // linea del arte. Con `left` habria que recolocar el campo segun la longitud del nombre.
    const x =
      campo.align === 'center'
        ? (campo.x / 100) * ctx.ancho - anchoTexto / 2
        : campo.align === 'right'
          ? (campo.x / 100) * ctx.ancho - anchoTexto
          : (campo.x / 100) * ctx.ancho;
    const y = yInicial - indice * tamano * 1.3;
    page.drawText(linea, { x, y, size: tamano, font: fuente, color: hexARgb(campo.color) });
  });
}

async function dibujarFirma(
  pdf: PDFDocument,
  page: PDFPage,
  firmante: FirmanteConstancia,
  imagen: Buffer | null,
  ctx: { ancho: number; alto: number; normal: PDFFont },
): Promise<void> {
  const anchoFirma = (firmante.width / 100) * ctx.ancho;
  const xIzq = (firmante.x / 100) * ctx.ancho - anchoFirma / 2;
  const yBase = ctx.alto - (firmante.y / 100) * ctx.alto;

  if (imagen) {
    const png = await incrustarImagen(pdf, imagen);
    if (png) {
      // El alto sale de la proporcion de la imagen: una firma estirada se nota y desacredita el
      // documento entero.
      const altoFirma = (png.height / png.width) * anchoFirma;
      page.drawImage(png, { x: xIzq, y: yBase, width: anchoFirma, height: altoFirma });
    }
  }

  /*
    LA LINEA Y EL NOMBRE VAN SIEMPRE, haya imagen o no.

    Una constancia sin la linea de firma con el nombre y el cargo debajo no se lee como un
    documento firmado, aunque tenga la rubrica escaneada encima. Y al reves: si la imagen falta
    —todavia no la subieron, o se borro del almacen— la constancia sigue saliendo con quien
    responde por ella escrito, que es lo que de verdad importa.
  */
  const tamano = ctx.alto * 0.018;
  page.drawLine({
    start: { x: xIzq, y: yBase - 4 },
    end: { x: xIzq + anchoFirma, y: yBase - 4 },
    thickness: 0.75,
    color: rgb(0.42, 0.45, 0.5),
  });

  const escribirCentrado = (texto: string, y: number, size: number) => {
    if (!texto) return;
    const w = ctx.normal.widthOfTextAtSize(texto, size);
    page.drawText(texto, {
      x: xIzq + anchoFirma / 2 - w / 2,
      y,
      size,
      font: ctx.normal,
      color: rgb(0.06, 0.08, 0.09),
    });
  };

  escribirCentrado(firmante.name, yBase - 4 - tamano - 4, tamano);
  escribirCentrado(firmante.title, yBase - 4 - tamano * 2 - 8, tamano * 0.85);
}

/**
 * Incrusta PNG o JPG probando los dos.
 *
 * No se mira la extension del nombre: el fichero llega del almacen por su clave, y una imagen
 * subida como `.png` puede ser un JPG renombrado. Probar el formato real es una linea y evita que
 * una constancia salga sin fondo por un nombre de archivo.
 */
async function incrustarImagen(pdf: PDFDocument, datos: Buffer): Promise<PDFImage | null> {
  const bytes = new Uint8Array(datos);
  return pdf
    .embedPng(bytes)
    .catch(() => pdf.embedJpg(bytes))
    .catch(() => null);
}

function hexARgb(hex: string) {
  const limpio = hex.replace('#', '');
  const n = Number.parseInt(limpio, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
