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
import { CurrentUser, RequirePermissions } from '../common/decorators.js';
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
   * Sirve el archivo en desarrollo (almacenamiento local). Exige sesion: el aislamiento del
   * tenant viene del prefijo de la clave, que se compara con el tenant del usuario.
   */
  @Get('file/:key')
  async file(@Param('key') key: string, @CurrentUser() user: AuthUser, @Res() res: Response) {
    const storageKey = decodeURIComponent(key);
    if (!storageKey.startsWith(`${user.tenantId}/`)) {
      throw new NotFoundException({ code: 'FILE_NOT_FOUND' });
    }
    const pkg = await this.prisma.scoped.contentPackage.findFirst({
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
