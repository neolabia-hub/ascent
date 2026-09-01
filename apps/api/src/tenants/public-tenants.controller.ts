import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { tenantBrandingSchema } from '@neo-pulse/shared';
import { Public } from '../common/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';

/**
 * Datos PUBLICOS del tenant para la pantalla de login (branding por subdominio, Decision #32).
 * Sin auth: expone SOLO nombre y branding, nunca settings ni datos de negocio.
 */
@Controller('public/tenants')
export class PublicTenantsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Public()
  @Get(':slug')
  async bySlug(@Param('slug') slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { name: true, active: true, branding: true },
    });
    if (!tenant || !tenant.active) throw new NotFoundException({ code: 'TENANT_NOT_FOUND' });
    const branding = tenantBrandingSchema.parse(tenant.branding ?? {});
    /*
      EL LOGO SALE YA FIRMADO (Decision #96).

      La pantalla de ingreso no tiene sesion, asi que no puede pedir la firma como hace el resto
      del producto: sin esto, la unica pantalla donde la marca de verdad importa seria la unica
      que no la puede ensenar. Y no abre nada — la firma sigue atando clave y caducidad, y lo que
      viaja es el logotipo de la empresa, que es publico por definicion: esta en su fachada.
    */
    const logoUrl = branding.logoKey ? this.storage.signPath(branding.logoKey) : null;
    return { name: tenant.name, branding, logoUrl };
  }
}
