import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { tenantBrandingSchema } from '@neo-pulse/shared';
import { Public } from '../common/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Datos PUBLICOS del tenant para la pantalla de login (branding por subdominio, Decision #32).
 * Sin auth: expone SOLO nombre y branding, nunca settings ni datos de negocio.
 */
@Controller('public/tenants')
export class PublicTenantsController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get(':slug')
  async bySlug(@Param('slug') slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { name: true, active: true, branding: true },
    });
    if (!tenant || !tenant.active) throw new NotFoundException({ code: 'TENANT_NOT_FOUND' });
    const branding = tenantBrandingSchema.parse(tenant.branding ?? {});
    return { name: tenant.name, branding };
  }
}
