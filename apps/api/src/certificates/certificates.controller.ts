import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { revokeCertificateSchema } from '@neo-pulse/shared';
import { CurrentUser, Public, RequirePermissions } from '../common/decorators.js';
import type { AuthUser } from '../common/types.js';
import { CertificateRenderService } from './certificate-render.service.js';
import { CertificateTemplatesService } from './certificate-templates.service.js';
import { CertificatesService } from './certificates.service.js';

/**
 * CONSTANCIAS (Sprint 5, Decision #110).
 *
 * Tres publicos distintos y por eso tres caminos:
 *
 *   /public/constancias/:codigo   cualquiera, SIN sesion. Es el punto del QR y del codigo impreso.
 *   /me/certificados              la persona, sobre lo suyo. Su expediente formativo.
 *   /certificates                 quien administra, sobre todos. Listar y revocar.
 */
@Controller()
export class CertificatesController {
  constructor(
    private readonly certificates: CertificatesService,
    private readonly templates: CertificateTemplatesService,
    private readonly render: CertificateRenderService,
  ) {}

  /**
   * VERIFICACION PUBLICA. Sin sesion, a proposito: quien comprueba una constancia es casi siempre
   * alguien de FUERA —el cliente que exige el curso de alturas, la ARL, otra empresa— y pedirle
   * una cuenta convertiria la verificacion en un tramite que nadie hace. Un papel que no se puede
   * comprobar no vale como evidencia.
   *
   * Lo que la protege no es el login sino el CODIGO: 20 caracteres aleatorios, no correlativos.
   * Con el serial (CERT-2026-000123) bastaria contar hacia arriba para leerse las constancias de
   * toda la plantilla; con esto no se puede enumerar.
   */
  @Public()
  // Estrecho: comprobar una constancia se hace una vez, y probar codigos al azar no puede salir
  // barato aunque adivinar uno sea practicamente imposible.
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Get('public/constancias/:codigo')
  verificar(@Param('codigo') codigo: string) {
    return this.certificates.porCodigo(codigo);
  }

  /** Las constancias propias. No pide permiso: todo el mundo puede ver su expediente. */
  @Get('me/certificados')
  mias(@CurrentUser() user: AuthUser) {
    return this.certificates.mias(user.tenantId, user.id);
  }

  /** Las de cualquiera, para quien lleva el expediente formativo de la empresa. */
  @Get('certificates')
  @RequirePermissions('certificates:issue')
  deAlguien(@CurrentUser() user: AuthUser, @Query('userId') userId?: string) {
    return this.certificates.mias(user.tenantId, userId ?? user.id);
  }

  /**
   * REVOCAR, nunca borrar. Exige motivo: una revocacion sin explicacion es indefendible seis meses
   * despues, que es justo cuando alguien pregunta por que esa constancia esta anulada.
   */
  @Post('certificates/:id/revoke')
  // Revocar tiene permiso PROPIO, distinto de verlas: anular la evidencia de que alguien se
  // capacito no es la misma potestad que consultarla.
  @RequirePermissions('certificates:revoke')
  @HttpCode(200)
  revocar(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const input = revokeCertificateSchema.parse(body);
    return this.certificates.revocar(user.tenantId, user.id, id, input.reason);
  }
// ─────────────────────────── El PDF ───────────────────────────

  /**
   * DESCARGAR LA PROPIA. Sin permiso: el expediente formativo es de quien se formo.
   *
   * Comprueba que la constancia SEA SUYA antes de servirla. Sin eso, cambiar el id en la barra de
   * direcciones daria la constancia de otra persona —con su nombre y su cedula—, y RLS no protege
   * de eso: las dos filas son del mismo tenant.
   */
  @Get('me/certificados/:id/pdf')
  async miPdf(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    const propia = await this.certificates.paraImprimir(user.tenantId, id);
    if (propia.userId !== user.id) throw new ForbiddenException({ code: 'NOT_YOURS' });
    await this.servirPdf(res, user.tenantId, id);
  }

  /** La de cualquiera, para quien lleva el expediente formativo de la empresa. */
  @Get('certificates/:id/pdf')
  @RequirePermissions('certificates:issue')
  async pdf(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    await this.servirPdf(res, user.tenantId, id);
  }

  // ─────────────────────────── Las plantillas ───────────────────────────

  @Get('certificate-templates')
  @RequirePermissions('config:manage_tenant')
  listarPlantillas() {
    return this.templates.list();
  }

  @Get('certificate-templates/:id')
  @RequirePermissions('config:manage_tenant')
  verPlantilla(@Param('id') id: string) {
    return this.templates.get(id);
  }

  @Post('certificate-templates')
  @RequirePermissions('config:manage_tenant')
  crearPlantilla(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.templates.create(user.tenantId, user.id, body);
  }

  @Put('certificate-templates/:id')
  @RequirePermissions('config:manage_tenant')
  guardarPlantilla(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.templates.update(user.tenantId, user.id, id, body);
  }

  @Delete('certificate-templates/:id')
  @RequirePermissions('config:manage_tenant')
  borrarPlantilla(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.templates.remove(user.tenantId, user.id, id);
  }

  /**
   * VISTA PREVIA con datos de ejemplo. Es lo que hace usable la pantalla de colocacion: sin ella
   * se mueven numeros a ciegas y el nombre encima del logo se descubre con cuarenta constancias ya
   * emitidas.
   */
  @Get('certificate-templates/:id/preview')
  @RequirePermissions('config:manage_tenant')
  async previa(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    const pdf = await this.render.vistaPrevia(user.tenantId, id);
    // `inline`: la vista previa se mira en el visor del navegador, no se descarga. Descargar un
    // fichero por cada ajuste de posicion llenaria la carpeta de descargas en diez minutos.
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="vista-previa.pdf"');
    res.end(Buffer.from(pdf));
  }

  private async servirPdf(res: Response, tenantId: string, id: string): Promise<void> {
    const { pdf, nombreArchivo } = await this.render.pdfDeConstancia(tenantId, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    res.end(Buffer.from(pdf));
  }
}
