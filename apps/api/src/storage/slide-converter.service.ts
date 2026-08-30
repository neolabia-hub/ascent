import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { promisify } from 'node:util';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { safeTempName } from './slide-storage.js';

const run = promisify(execFile);

/**
 * UNA PRESENTACION SE CONVIERTE EN DIAPOSITIVAS, no se sirve como archivo.
 *
 * El caso real: una ARL manda su presentacion el dia antes de la capacitacion. Pedirle al
 * administrador que la rehaga a tarjetas no va a pasar; subirla y llamar a eso un curso es lo que
 * todas las guias del sector desaconsejan. La salida es la de Docebo: convertir cada diapositiva
 * en una IMAGEN y reproducirla con el reproductor del producto.
 *
 * Por que imagenes y no el archivo original:
 *  - se ve IGUAL en cualquier telefono, sin depender del Office de nadie ni de un visor;
 *  - no se descarga el original si no se quiere;
 *  - y sobre todo SE PUEDE MEDIR: que diapositiva vio, cuanto tiempo y hasta donde llego. Un PDF
 *    embebido en un iframe no da nada de eso, y sin eso no hay evidencia que sostener.
 *
 * Lo que se PIERDE, y se dice al subir: animaciones, videos incrustados e hipervinculos. Es la
 * misma limitacion que tiene el conversor de Docebo, por la misma razon.
 *
 * DOS CAMINOS, a proposito:
 *  - PDF: se rasteriza aqui mismo, con librerias de npm. Funciona en cualquier maquina sin
 *    instalar nada, y es el camino que siempre esta disponible.
 *  - PPT/PPTX/ODP: necesita LibreOffice en modo consola para pasar a PDF. Si no esta, NO se falla
 *    en silencio ni se sube un archivo que nadie podra ver: se dice que falta y se ofrece la
 *    salida (exportar a PDF desde PowerPoint, que es un clic).
 */

/**
 * Formato de las diapositivas. PNG parece la opcion obvia y es la equivocada: una diapositiva
 * lleva fotos y degradados, y en PNG pesaba 1,4 MB cada una —doce megas por una presentacion de
 * once—. Eso en un telefono en carretera no se abre. WebP con calidad 82 da la misma lectura por
 * una fraccion del peso, y lo entiende cualquier navegador desde hace anos.
 */
const SLIDE_FORMAT = 'webp' as const;
const SLIDE_QUALITY = 82;
export const SLIDE_MIME = 'image/webp';

/** Ancho al que se rasteriza. 1600 px se ve nitido en un portatil y pesa poco en un telefono. */
const TARGET_WIDTH = 1600;
const MAX_SLIDES = 200;
const OFFICE_TIMEOUT_MS = 120_000;

export interface ConvertedSlide {
  /** 1-based: es lo que ve la persona ("diapositiva 4 de 24"). */
  index: number;
  image: Buffer;
  width: number;
  height: number;
}

@Injectable()
export class SlideConverterService {
  private readonly logger = new Logger(SlideConverterService.name);

  /** Extensiones de ofimatica que exigen LibreOffice. El PDF no pasa por aqui. */
  static readonly OFFICE_EXTENSIONS = ['.ppt', '.pptx', '.odp'];

  /**
   * Ruta de LibreOffice. Se resuelve UNA vez y se recuerda, incluso el fallo: preguntar por el
   * binario en cada subida no cambia la respuesta y si retrasa el error.
   */
  private officeBinary: string | null | undefined;

  async isOfficeAvailable(): Promise<boolean> {
    return (await this.resolveOfficeBinary()) !== null;
  }

  /**
   * Convierte una presentacion en una imagen por diapositiva.
   *
   * `originalName` decide el camino: la firma binaria ya valido que el archivo es lo que dice ser,
   * pero un PPTX y un XLSX son los dos un ZIP, asi que la extension es lo unico que distingue.
   */
  async toSlides(source: Buffer, originalName: string): Promise<ConvertedSlide[]> {
    const isOffice = SlideConverterService.OFFICE_EXTENSIONS.some((ext) =>
      originalName.toLowerCase().endsWith(ext),
    );
    const pdf = isOffice ? await this.officeToPdf(source, originalName) : source;
    return this.pdfToSlides(pdf);
  }

  /** PPT/PPTX/ODP -> PDF con LibreOffice sin interfaz. */
  private async officeToPdf(source: Buffer, originalName: string): Promise<Buffer> {
    const binary = await this.resolveOfficeBinary();
    if (!binary) {
      throw new BadRequestException({
        code: 'OFFICE_CONVERTER_UNAVAILABLE',
        message:
          'Este servidor no tiene LibreOffice para convertir PowerPoint. Exporta la presentacion a PDF desde PowerPoint (Archivo, Guardar como, PDF) y sube el PDF: el resultado es identico.',
      });
    }

    // Cada conversion en su propio directorio Y con su propio perfil de usuario: LibreOffice
    // guarda estado en el perfil y dos conversiones a la vez sobre el mismo perfil se pisan (la
    // segunda termina sin escribir nada, y en silencio).
    const workDir = await mkdtemp(join(tmpdir(), 'neo-pulse-slides-'));
    try {
      const inputPath = join(workDir, safeTempName(originalName));
      await writeFile(inputPath, source);
      await run(
        binary,
        [
          '--headless',
          '--norestore',
          `-env:UserInstallation=file:///${workDir.replace(/\\/g, '/')}/profile`,
          '--convert-to',
          'pdf',
          '--outdir',
          workDir,
          inputPath,
        ],
        { timeout: OFFICE_TIMEOUT_MS, windowsHide: true },
      );

      const produced = (await readdir(workDir)).find((name) => name.toLowerCase().endsWith('.pdf'));
      if (!produced) {
        throw new BadRequestException({
          code: 'PRESENTATION_CONVERT_FAILED',
          message: 'No pudimos convertir la presentacion. Prueba a exportarla a PDF y subir el PDF.',
        });
      }
      return await readFile(join(workDir, produced));
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** PDF -> una imagen por pagina, con pdf.js y un lienzo nativo (sin binarios del sistema). */
  private async pdfToSlides(pdf: Buffer): Promise<ConvertedSlide[]> {
    // Importes diferidos: pdf.js es un modulo ESM pesado y no tiene por que cargarse al arrancar
    // la API si nadie sube una presentacion.
    const canvasLib = await import('@napi-rs/canvas');
    const { createCanvas } = canvasLib;
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

    /**
     * pdf.js no dibuja solo en el lienzo que le damos: crea los SUYOS para los grupos de
     * transparencia y luego los compone con `drawImage`. Su fabrica por defecto necesita
     * `document`, que en Node no existe, y un lienzo de otra libreria no lo reconoce
     * ("Value is none of these types `CanvasElement`...").
     *
     * Se le pasa la fabrica como CLASE —asi la pide `getDocument`, y la instancia el— para que
     * TODOS los lienzos, el nuestro y los suyos, salgan de la misma libreria.
     */
    class NodeCanvasFactory {
      create(width: number, height: number) {
        const canvas = createCanvas(Math.max(1, width), Math.max(1, height));
        return { canvas, context: canvas.getContext('2d') };
      }
      reset(target: { canvas: { width: number; height: number } }, width: number, height: number) {
        target.canvas.width = Math.max(1, width);
        target.canvas.height = Math.max(1, height);
      }
      destroy(target: { canvas: { width: number; height: number } }) {
        target.canvas.width = 0;
        target.canvas.height = 0;
      }
    }

    /**
     * LAS 14 FUENTES ESTANDAR HAY QUE DARSELAS, o el texto no se dibuja.
     *
     * Un PDF puede referirse a Helvetica, Times o Courier SIN incrustarlas: el lector las pone.
     * Sin esta ruta, pdf.js avisa "getPathGenerator - ignoring character" y la diapositiva sale
     * con huecos donde iba el texto. Se vio con un PDF de prueba y afecta a cualquier PDF simple
     * exportado por una herramienta que no incruste fuentes.
     *
     * OJO: en Node se pasa una RUTA DE DISCO terminada en separador, no una URL. Con `file://`
     * pdf.js intenta descargarla con `fetch`, que no admite ese esquema, falla EN SILENCIO y la
     * diapositiva sale igual de vacia que sin la opcion. Se comprobo mirando la imagen: fondo y
     * recuadros si, texto no.
     *
     * La ruta se resuelve desde el propio paquete y no se escribe a mano: con pnpm, `node_modules`
     * no esta donde uno cree.
     */
    // `require.resolve` y no `createRequire(import.meta.url)`: este paquete se compila a
    // CommonJS (`nest build`), donde `import.meta` no existe. Con el, la compilacion fallaba y el
    // servidor seguia sirviendo el codigo VIEJO: las diapositivas salian sin texto y nada en la
    // pantalla lo delataba.
    const standardFontDataUrl = join(dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts') + sep;

    const document = await pdfjs.getDocument({
      data: new Uint8Array(pdf),
      // Sin fuentes DEL SISTEMA ni ejecucion de nada que venga dentro del archivo: esto procesa un
      // fichero que subio un usuario. Las estandar de arriba no son del sistema: vienen del
      // paquete y son las que el formato da por supuestas.
      isEvalSupported: false,
      useSystemFonts: false,
      standardFontDataUrl,
      CanvasFactory: NodeCanvasFactory as never,
    }).promise;

    try {
      if (document.numPages > MAX_SLIDES) {
        throw new BadRequestException({
          code: 'PRESENTATION_TOO_LONG',
          message: `La presentacion tiene ${document.numPages} diapositivas y el limite es ${MAX_SLIDES}. Partela en varias partes: tambien se sigue mejor.`,
        });
      }

      const slides: ConvertedSlide[] = [];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
        const page = await document.getPage(pageNumber);
        const base = page.getViewport({ scale: 1 });
        // Se escala por ANCHO: una presentacion es apaisada y el ancho es lo que manda en pantalla.
        const viewport = page.getViewport({ scale: TARGET_WIDTH / base.width });
        const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
        const context = canvas.getContext('2d');
        // Fondo blanco explicito: un PDF sin fondo se rasteriza transparente, y una diapositiva
        // transparente sobre el fondo oscuro del reproductor no se lee.
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);

        // El lienzo nativo cumple la misma interfaz que el del navegador, pero este proyecto no
        // carga los tipos del DOM en la API: se cruza aqui, en un solo punto y a la vista.
        await page.render({
          canvasContext: context as unknown as Parameters<typeof page.render>[0]['canvasContext'],
          viewport,
        }).promise;
        page.cleanup();

        slides.push({
          index: pageNumber,
          image: await canvas.encode(SLIDE_FORMAT, SLIDE_QUALITY),
          width: canvas.width,
          height: canvas.height,
        });
      }
      return slides;
    } finally {
      await document.destroy().catch(() => undefined);
    }
  }

  /**
   * Donde esta LibreOffice. En Linux (produccion) esta en el PATH; en Windows se instala en
   * Program Files y NO se anade al PATH, asi que hay que mirar donde cae.
   */
  private async resolveOfficeBinary(): Promise<string | null> {
    if (this.officeBinary !== undefined) return this.officeBinary;

    const candidates = [
      process.env.LIBREOFFICE_PATH,
      'soffice',
      'libreoffice',
      'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
      'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
      '/usr/bin/soffice',
      '/usr/bin/libreoffice',
    ].filter((value): value is string => Boolean(value));

    for (const candidate of candidates) {
      try {
        await run(candidate, ['--version'], { timeout: 20_000, windowsHide: true });
        this.logger.log(`Conversor de presentaciones: LibreOffice en ${candidate}`);
        this.officeBinary = candidate;
        return candidate;
      } catch {
        // Siguiente candidato: que no este en una ruta no es un error, es lo normal.
      }
    }

    this.logger.warn(
      'Sin LibreOffice: solo se podran subir presentaciones en PDF. Instalalo (winget install TheDocumentFoundation.LibreOffice) o define LIBREOFFICE_PATH.',
    );
    this.officeBinary = null;
    return null;
  }
}
