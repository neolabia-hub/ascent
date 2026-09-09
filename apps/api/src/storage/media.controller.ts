import { createHash } from 'node:crypto';
import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { PackageKind } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser, Public, RequirePermissions } from '../common/decorators.js';
import type { AuthUser } from '../common/types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { detectType } from './magic-bytes.js';
import { SLIDE_MIME, SlideConverterService } from './slide-converter.service.js';
import { manifestHasSlide, parentPresentationKey, slideKey } from './slide-storage.js';
import { StorageService } from './storage.service.js';

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/** Una evidencia es un PDF o una foto: 25 MB sobran y evitan que alguien suba un video por error. */
const MAX_EVIDENCIA_BYTES = 25 * 1024 * 1024;

/** Lo unico que es evidencia de una asistencia: el papel, o la foto del papel. */
const EVIDENCIA_PERMITIDA = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

/**
 * UNA FIRMA CABE EN 300 KB DE SOBRA: es un trazo sobre un lienzo de 600x200. El tope no es tacaneria,
 * es la defensa que queda cuando la puerta la puede usar CUALQUIER usuario autenticado —`attendance:sign`
 * lo tiene todo el mundo— y no solo quien toma listas.
 */
const MAX_FIRMA_BYTES = 300 * 1024;

/** Y solo PNG: es lo que produce un lienzo del navegador, y no hay razon para aceptar otra cosa. */
const FIRMA_PERMITIDA = new Set(['image/png']);

@Controller('media')
export class MediaController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly slides: SlideConverterService,
  ) {}

  /** Sube un archivo y crea el paquete de contenido (inmutable: resubir crea otro paquete). */
  @Post('upload')
  @RequirePermissions('lessons:manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async upload(
    @CurrentUser() actor: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
    @Query('kind') kind = 'media',
  ) {
    if (!file) throw new BadRequestException({ code: 'FILE_REQUIRED', field: 'file' });

    const detected = detectType(file.buffer);
    if (!detected) {
      throw new BadRequestException({
        code: 'UNSUPPORTED_FILE_TYPE',
        message: 'Tipo de archivo no permitido o no reconocido.',
        allowed: ['jpeg', 'png', 'gif', 'webp', 'pdf', 'mp4', 'xlsx', 'docx', 'zip'],
      });
    }

    const tenantId = this.prisma.currentTenantId;
    const storageKey = this.storage.buildKey(tenantId, kind, file.originalname);
    await this.storage.put(storageKey, file.buffer, detected.mimeType);

    const packageKind: PackageKind =
      detected.family === 'VIDEO' ? 'VIDEO' : kind === 'scorm' && detected.family === 'ARCHIVE' ? 'SCORM_12' : 'FILE';

    const created = await this.prisma.scoped.contentPackage.create({
      data: {
        tenantId,
        kind: packageKind,
        storageKey,
        originalName: file.originalname.slice(0, 200),
        mimeType: detected.mimeType,
        sizeBytes: file.size,
        checksum: createHash('sha256').update(file.buffer).digest('hex'),
        uploadedBy: actor.id,
      },
      select: { id: true, kind: true, storageKey: true, originalName: true, mimeType: true, sizeBytes: true },
    });
    return created;
  }

  /**
   * SUBIR UNA EVIDENCIA DE ASISTENCIA: el papel de un tercero o el acta firmada.
   *
   * ─── POR QUE NO SIRVE `/media/upload` ───
   *
   * Aquel existe para el CONTENIDO que la gente cursa: pide `lessons:manage` y crea un
   * `ContentPackage`, que es una pieza reutilizable del catalogo. Una evidencia no es ninguna de las
   * dos cosas:
   *
   *   · **El permiso es otro.** Quien toma una lista de asistencia tiene `attendance:take` y no
   *     tiene por que poder tocar el catalogo de lecciones. Pedirle `lessons:manage` para adjuntar
   *     el PDF que le acaba de dar la ARL obligaria a darle permisos de autoria — o, lo que pasa de
   *     verdad, a que no adjunte nada.
   *   · **No es un paquete de contenido.** Un `ContentPackage` se puede reutilizar en varias
   *     formaciones; el acta de la jornada del 6 de septiembre pertenece a ESA jornada y a ninguna
   *     otra. Crear uno seria sembrar el catalogo de piezas que nadie va a volver a usar.
   *
   * Asi que esto solo guarda el archivo y devuelve su clave. Quien la recibe la manda dentro de la
   * lista (`certificate.fileKey`) o de la jornada (`attendanceSheetKey`), y es ahi donde queda
   * atada a algo.
   *
   * ─── QUE SE ACEPTA ───
   *
   * PDF e imagenes, y nada mas. Un certificado llega en PDF; un acta firmada llega escaneada o,
   * mas a menudo de lo que parece, fotografiada con el telefono en el salon. Lo demas —videos,
   * hojas de calculo, ZIPs— no es evidencia de nada y aceptarlo solo abre la puerta a que el
   * almacenamiento se llene de cosas que nadie va a abrir.
   *
   * El tipo se comprueba por los BYTES (`detectType`) y no por la extension ni por lo que diga el
   * navegador: renombrar un `.exe` a `.pdf` es el ataque de manual, y aqui sube gente desde el
   * movil en mitad de una jornada.
   */
  @Post('evidencia')
  @RequirePermissions('attendance:take')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_EVIDENCIA_BYTES } }))
  async subirEvidencia(@CurrentUser() actor: AuthUser, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException({ code: 'FILE_REQUIRED', field: 'file' });

    const detected = detectType(file.buffer);
    if (!detected || !EVIDENCIA_PERMITIDA.has(detected.mimeType)) {
      throw new BadRequestException({
        code: 'UNSUPPORTED_FILE_TYPE',
        message: 'La evidencia tiene que ser un PDF o una imagen: el certificado o el acta escaneada.',
        allowed: ['pdf', 'jpeg', 'png', 'webp'],
      });
    }

    const tenantId = this.prisma.currentTenantId;
    const storageKey = this.storage.buildKey(tenantId, 'evidencia', file.originalname);
    await this.storage.put(storageKey, file.buffer, detected.mimeType);

    /*
      NO SE GUARDA FILA EN NINGUNA TABLA, y es deliberado. El archivo no significa nada hasta que
      alguien lo ata a una persona o a una jornada, y eso pasa al guardar la lista. Si el usuario
      sube el PDF y despues cierra la ventana sin guardar, lo que queda es un archivo huerfano en el
      disco —barato— y no una fila de evidencia que no evidencia nada, que es lo caro en auditoria.
    */
    return {
      key: storageKey,
      originalName: file.originalname.slice(0, 200),
      mimeType: detected.mimeType,
      sizeBytes: file.size,
      uploadedBy: actor.id,
    };
  }

  /**
   * SUBIR LA FIRMA DE QUIEN ASISTE (mecanismo 3, `PENDIENTES` 2.4).
   *
   * Puerta propia y no la de evidencia, por lo mismo que aquella no es la del contenido: **el
   * permiso es otro**. Quien firma su asistencia tiene `attendance:sign`, que tiene todo el mundo, y
   * no puede tener el de tomar la lista de los demas.
   *
   * Y por eso es la mas estrecha de las tres: **solo PNG y 300 KB**. Un lienzo de navegador produce
   * exactamente eso; lo demas —un PDF, una foto de 8 MB, un video— no es una firma, y aqui la puerta
   * la puede empujar cualquiera con sesion.
   *
   * La imagen es un DATO BIOMETRICO (habeas data): se guarda bajo el prefijo del tenant como todo lo
   * demas, y solo se sirve a quien tenga una firma de acceso valida. No se devuelve en ninguna lista
   * ni se enseña en pantalla: donde aparece es dentro del acta.
   */
  @Post('firma')
  @RequirePermissions('attendance:sign')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FIRMA_BYTES } }))
  async subirFirma(@CurrentUser() actor: AuthUser, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException({ code: 'FILE_REQUIRED', field: 'file' });

    const detected = detectType(file.buffer);
    if (!detected || !FIRMA_PERMITIDA.has(detected.mimeType)) {
      throw new BadRequestException({
        code: 'UNSUPPORTED_FILE_TYPE',
        message: 'La firma se manda como PNG: es lo que produce el lienzo de la pantalla.',
        allowed: ['png'],
      });
    }

    const tenantId = this.prisma.currentTenantId;
    // La clave lleva el id de quien firma: una firma sin dueño no es evidencia de nada, y asi se ve
    // de quien es sin abrir la imagen.
    const storageKey = this.storage.buildKey(tenantId, 'firmas', `${actor.id}.png`);
    await this.storage.put(storageKey, file.buffer, detected.mimeType);

    return { key: storageKey, mimeType: detected.mimeType, sizeBytes: file.size };
  }

  /**
   * SUBIR UNA PRESENTACION. No se guarda para servirla: se CONVIERTE en una imagen por
   * diapositiva y lo que queda es una secuencia reproducible y medible (ver `slide-converter`).
   *
   * El original se guarda igual, y a proposito: es el documento que entrego la ARL o el
   * proveedor, y ante una auditoria puede hacer falta ensenarlo tal cual. Lo que se reproduce, en
   * cambio, son siempre las diapositivas.
   */
  @Post('presentation')
  @RequirePermissions('lessons:manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async uploadPresentation(@CurrentUser() actor: AuthUser, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException({ code: 'FILE_REQUIRED', field: 'file' });

    const detected = detectType(file.buffer);
    // PDF, o un ZIP que ademas se llame .pptx/.odp: la firma binaria de un PPTX ES la de un ZIP,
    // asi que la extension es lo unico que separa una presentacion de una hoja de calculo.
    const isOffice = SlideConverterService.OFFICE_EXTENSIONS.some((ext) =>
      file.originalname.toLowerCase().endsWith(ext),
    );
    if (!detected || (detected.family !== 'DOCUMENT' && !(detected.family === 'ARCHIVE' && isOffice))) {
      throw new BadRequestException({
        code: 'UNSUPPORTED_PRESENTATION',
        message: 'Sube una presentacion en PDF, PPT, PPTX u ODP.',
      });
    }

    const slides = await this.slides.toSlides(file.buffer, file.originalname);
    if (slides.length === 0) {
      throw new BadRequestException({ code: 'PRESENTATION_EMPTY', message: 'La presentacion no tiene diapositivas.' });
    }

    const tenantId = this.prisma.currentTenantId;
    const sourceKey = this.storage.buildKey(tenantId, 'presentation', file.originalname);
    await this.storage.put(sourceKey, file.buffer, detected.mimeType);

    // Las diapositivas cuelgan de la clave del original: se ve de un vistazo a que presentacion
    // pertenece cada imagen, y borrar la carpeta se las lleva todas.
    const manifestSlides = [];
    for (const slide of slides) {
      const key = slideKey(sourceKey, slide.index);
      await this.storage.put(key, slide.image, SLIDE_MIME);
      manifestSlides.push({ index: slide.index, key, width: slide.width, height: slide.height });
    }

    const created = await this.prisma.scoped.contentPackage.create({
      data: {
        tenantId,
        kind: 'PRESENTATION',
        storageKey: sourceKey,
        originalName: file.originalname.slice(0, 200),
        mimeType: detected.mimeType,
        sizeBytes: file.size,
        checksum: createHash('sha256').update(file.buffer).digest('hex'),
        manifest: { slides: manifestSlides, convertedAt: new Date().toISOString() },
        uploadedBy: actor.id,
      },
      select: { id: true, kind: true, storageKey: true, originalName: true, mimeType: true, sizeBytes: true, manifest: true },
    });
    return created;
  }

  /** Si este servidor puede convertir PowerPoint, o solo PDF. La pantalla lo dice ANTES de subir. */
  @Get('presentation/capabilities')
  @RequirePermissions('lessons:manage')
  async presentationCapabilities() {
    return { office: await this.slides.isOfficeAvailable() };
  }

  /**
   * Firma temporal para una clave de almacenamiento.
   *
   * Esta SI exige sesion, y ahi esta el reparto: quien pide la firma se identifica y se comprueba
   * que el archivo sea de SU empresa; quien luego descarga con la firma ya no necesita
   * identificarse, que es lo unico que permite usarla en un `<img>` o un `<video>`.
   */
  @Get('sign')
  sign(@Query('key') key: string | undefined, @CurrentUser() user: AuthUser) {
    if (!key) throw new BadRequestException({ code: 'KEY_REQUIRED', field: 'key' });
    if (!key.startsWith(`${user.tenantId}/`)) throw new NotFoundException({ code: 'FILE_NOT_FOUND' });
    return { url: this.storage.signPath(key) };
  }

  /** URL de acceso al paquete (firmada en produccion, ruta interna en desarrollo). */
  @Get(':packageId/url')
  async url(@Param('packageId', ParseUUIDPipe) packageId: string) {
    const pkg = await this.prisma.scoped.contentPackage.findUnique({
      where: { id: packageId },
      select: { storageKey: true, mimeType: true, originalName: true },
    });
    if (!pkg) throw new NotFoundException({ code: 'PACKAGE_NOT_FOUND' });
    return { url: await this.storage.getSignedUrl(pkg.storageKey), mimeType: pkg.mimeType, name: pkg.originalName };
  }

  /**
   * Sirve el archivo (almacenamiento local en desarrollo).
   *
   * ES PUBLICO PERO FIRMADO, y no por comodidad: una etiqueta `<img>`, `<video>` o un `<iframe>`
   * NO puede enviar la cabecera de autorizacion, asi que exigir el token aqui hacia que ningun
   * archivo subido se viera nunca —imagenes de tarjetas, videos y documentos devolvian 401 y la
   * pantalla se quedaba en blanco—. Es el patron de URL prefirmada que ya prescribe CLAUDE.md 11.
   *
   * Lo que protege el acceso es la firma: caduca, va atada a ESA clave concreta y no se puede
   * fabricar sin el secreto del servidor. La clave sigue llevando el prefijo del tenant, asi que
   * una firma de una empresa no sirve para los archivos de otra.
   */
  @Public()
  @Get('file/:key')
  async file(
    @Param('key') key: string,
    @Query('e') expiresAt: string | undefined,
    @Query('t') signature: string | undefined,
    @Headers('range') rangeHeader: string | undefined,
    @Res() res: Response,
  ) {
    const storageKey = decodeURIComponent(key);
    if (!this.storage.verifySignature(storageKey, expiresAt, signature)) {
      throw new NotFoundException({ code: 'FILE_NOT_FOUND' });
    }

    // Sin sesion no hay tenant en el contexto: se toma del prefijo de la clave, que es justo lo
    // que la firma acaba de garantizar que nadie ha manipulado.
    const tenantId = storageKey.split('/')[0] ?? '';
    if (!/^[0-9a-f-]{36}$/.test(tenantId)) throw new NotFoundException({ code: 'FILE_NOT_FOUND' });

    const pkg = await this.resolveServable(tenantId, storageKey);
    if (!pkg) throw new NotFoundException({ code: 'FILE_NOT_FOUND' });

    /*
      CON R2, LOS BYTES NO PASAN POR AQUI.

      Servirlos desde el servidor haria que cada video viajara DOS veces —del bucket a la maquina y
      de la maquina al telefono— y convertiria el ancho de banda del servidor en el techo de cuanta
      gente puede ver una formacion a la vez. Es justo lo que R2 (egress cero) existe para evitar.

      Lo que protege el acceso NO se relaja: la firma propia ya se comprobo arriba y el paquete ya
      se resolvio contra la base. Solo despues de las dos cosas se emite una URL del bucket, que
      ademas caduca en una hora. Y los rangos los resuelve R2 nativamente, que es lo que necesita el
      reproductor para saltar en un video.
    */
    if (!this.storage.isLocal) {
      res.redirect(302, await this.storage.getSignedUrl(storageKey, 3600));
      return;
    }

    const size = await this.storage.size(storageKey);
    if (size === null) throw new NotFoundException({ code: 'FILE_NOT_FOUND' });

    res.setHeader('Content-Type', pkg.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(pkg.originalName)}"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    // Se ANUNCIA siempre, tambien en la respuesta completa: es como el navegador sabe que puede
    // pedir trozos, y sin ese anuncio no lo intenta.
    res.setHeader('Accept-Ranges', 'bytes');
    this.allowEmbedding(res);

    const range = parseRange(rangeHeader, size);
    if (range === 'INVALID') {
      res.status(416).setHeader('Content-Range', `bytes */${size}`);
      res.end();
      return;
    }

    if (range) {
      res.status(206);
      res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
      res.setHeader('Content-Length', range.end - range.start + 1);
    } else {
      res.setHeader('Content-Length', size);
    }

    // Se ENVIA POR TROZOS y no con el archivo entero en memoria: un video de 100 MB multiplicado
    // por cada persona que lo abre a la vez tumba el servidor.
    const stream = this.storage.stream(storageKey, range ?? undefined);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }

  /**
   * QUE se puede servir con una firma valida.
   *
   * La regla de siempre: solo lo que esta registrado como paquete de esta empresa. Un archivo
   * suelto en el disco no se sirve aunque alguien acierte la clave.
   *
   * Las DIAPOSITIVAS de una presentacion no son paquetes propios —son derivadas del mismo
   * archivo— y viven bajo `<clave del original>.slides/NNN.webp`. Se autorizan comprobando que su
   * paquete padre exista y que esa imagen figure de verdad en su manifiesto: asi una clave
   * inventada bajo esa carpeta no cuela.
   */
  private async resolveServable(
    tenantId: string,
    storageKey: string,
  ): Promise<{ mimeType: string; originalName: string } | null> {
    const db = this.prisma.forTenant(tenantId);
    const own = await db.contentPackage.findFirst({
      where: { storageKey },
      select: { mimeType: true, originalName: true },
    });
    if (own) return own;

    /*
      LA EVIDENCIA Y LAS ACTAS TAMBIEN SE SIRVEN (2026-09-08).

      Antes solo se servia lo registrado como `ContentPackage`, asi que el certificado escaneado, el
      acta de la jornada y la firma se subian y **no se podian volver a abrir**: quedaban en el disco
      y ninguna pantalla podia enseñarlos. Una evidencia que no se puede volver a ver no es evidencia.

      La regla sigue siendo la misma y por eso esto no abre nada: se sirve un archivo si **alguna fila
      del dominio apunta a el**. Una clave suelta en el disco sigue sin servirse aunque se acierte.
    */
    const evidencia = await this.resolveEvidencia(db, storageKey);
    if (evidencia) return evidencia;

    const parentKey = parentPresentationKey(storageKey);
    if (!parentKey) return null;

    const parent = await db.contentPackage.findFirst({
      where: { storageKey: parentKey, kind: 'PRESENTATION' },
      select: { originalName: true, manifest: true },
    });
    if (!parent) return null;

    if (!manifestHasSlide(parent.manifest, storageKey)) return null;
    return { mimeType: SLIDE_MIME, originalName: parent.originalName };
  }

  /**
   * ¿HAY ALGUNA FILA QUE APUNTE A ESTE ARCHIVO?
   *
   * Las seis puertas por las que una evidencia entra al sistema: el acta escaneada de la jornada, el
   * certificado de un tercero —en la inscripcion y en la obligacion convalidada—, la firma de quien
   * asistio y el acta que genera el sistema. Si ninguna lo cita, el archivo no se sirve.
   *
   * El tipo se deduce de la clave y no se guarda: el acta generada es siempre PDF, las firmas son
   * siempre PNG, y de lo que sube un usuario ya se comprobo la firma binaria al entrar.
   */
  private async resolveEvidencia(
    db: ReturnType<PrismaService['forTenant']>,
    storageKey: string,
  ): Promise<{ mimeType: string; originalName: string } | null> {
    const [jornada, inscripcion, obligacion, firma, acta] = await Promise.all([
      db.offering.findFirst({ where: { attendanceSheetKey: storageKey }, select: { code: true } }),
      db.enrollment.findFirst({ where: { extCertFileKey: storageKey }, select: { id: true } }),
      db.assignment.findFirst({ where: { extCertFileKey: storageKey }, select: { id: true } }),
      db.attendanceRecord.findFirst({ where: { signatureKey: storageKey }, select: { userId: true } }),
      db.sessionAct.findFirst({ where: { pdfStorageKey: storageKey }, select: { id: true } }),
    ]);

    if (acta) return { mimeType: 'application/pdf', originalName: 'acta-de-sesion.pdf' };
    if (firma) return { mimeType: 'image/png', originalName: 'firma.png' };
    if (jornada || inscripcion || obligacion) {
      return { mimeType: mimeDeLaClave(storageKey), originalName: nombreDeLaClave(storageKey) };
    }
    return null;
  }

  /**
   * DEJA QUE EL NAVEGADOR PINTE EL ARCHIVO. Esta es la mitad que faltaba del arreglo de las URL
   * firmadas: quitar el 401 no bastaba.
   *
   * Helmet marca TODA la API con `Cross-Origin-Resource-Policy: same-origin`, y eso es correcto
   * para los datos —nadie debe poder leer nuestro JSON desde otra pagina—. Pero la web y la API
   * viven en origenes distintos (3100 y 3002 en desarrollo, subdominios en produccion), asi que
   * esa misma cabecera hacia que el navegador BLOQUEARA cada archivo antes de entregarselo a la
   * etiqueta: el video se quedaba girando para siempre, sin error visible, y el PDF no se abria
   * porque `X-Frame-Options` prohibe embeberlo.
   *
   * Se abre SOLO en esta ruta, y no es un agujero: aqui no hay datos de sesion, la URL viene
   * firmada, caduca en una hora y va atada a una unica clave. Lo que se comparte es exactamente
   * lo que se quiso compartir.
   */
  private allowEmbedding(res: Response): void {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    // `X-Frame-Options` no admite lista de origenes: se retira y se deja que mande `frame-ancestors`,
    // que si distingue quien puede embeber. Un PDF en visor es un iframe.
    res.removeHeader('X-Frame-Options');
    const frontend = process.env.FRONTEND_URL ?? 'http://localhost:3100';
    res.setHeader('Content-Security-Policy', `default-src 'none'; frame-ancestors 'self' ${frontend}`);
  }
}

/** El tipo sale de la extension de la clave, que la construyo el servidor al subirla. */
function mimeDeLaClave(key: string): string {
  const ext = key.slice(key.lastIndexOf('.') + 1).toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

/** El nombre original va dentro de la clave (`buildKey`): sirve para que la descarga no se llame "file". */
function nombreDeLaClave(key: string): string {
  return key.slice(key.lastIndexOf('/') + 1) || 'evidencia';
}

/**
 * `Range: bytes=inicio-fin`. Devuelve null si el cliente no pidio rango, e 'INVALID' si pidio uno
 * que no existe (hay que contestar 416, no un trozo cualquiera).
 *
 * Solo se atiende UN rango: los multiparte no los usa ningun reproductor y complicarian esto sin
 * ganar nada.
 */
function parseRange(header: string | undefined, size: number): { start: number; end: number } | null | 'INVALID' {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;

  // `bytes=-500` son los ULTIMOS 500 bytes, no los primeros. Es como un reproductor busca la
  // tabla de indices de un MP4 que la tiene al final.
  const start = rawStart ? Number(rawStart) : Math.max(0, size - Number(rawEnd));
  const end = rawStart ? (rawEnd ? Math.min(Number(rawEnd), size - 1) : size - 1) : size - 1;

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return 'INVALID';
  return { start, end };
}
