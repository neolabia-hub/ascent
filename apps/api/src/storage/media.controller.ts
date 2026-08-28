import { createHash } from 'node:crypto';
import {
  BadRequestException,
  Controller,
  Get,
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
import { StorageService } from './storage.service.js';

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

@Controller('media')
export class MediaController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
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

    const pkg = await this.prisma.forTenant(tenantId).contentPackage.findFirst({
      where: { storageKey },
      select: { mimeType: true, originalName: true },
    });
    if (!pkg) throw new NotFoundException({ code: 'FILE_NOT_FOUND' });

    const body = await this.storage.read(storageKey).catch(() => null);
    if (!body) throw new NotFoundException({ code: 'FILE_NOT_FOUND' });

    res.setHeader('Content-Type', pkg.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(pkg.originalName)}"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(body);
  }
}
