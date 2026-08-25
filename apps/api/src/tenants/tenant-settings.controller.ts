import { Body, Controller, Get, Put } from '@nestjs/common';
import { tenantBrandingSchema, tenantSettingsSchema } from '@neo-pulse/shared';
import { AuditService } from '../common/audit.service.js';
import { CurrentUser, RequirePermissions } from '../common/decorators.js';
import type { AuthUser } from '../common/types.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Configuracion del tenant (Decision #18): settings y branding validados con Zod (fuente unica).
 * PUT reemplaza el objeto completo YA validado — la UI edita sobre el GET previo.
 * Recordatorio de cascada (Decision #27): cambiar settings NO reinterpreta versiones publicadas.
 */
@Controller('tenant')
export class TenantSettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('settings')
  @RequirePermissions('config:manage_tenant')
  async getSettings() {
    const tenant = await this.currentTenant();
    return { settings: tenantSettingsSchema.parse(tenant.settings ?? {}) };
  }

  @Put('settings')
  @RequirePermissions('config:manage_tenant')
  async putSettings(@CurrentUser() actor: AuthUser, @Body() body: unknown) {
    const settings = tenantSettingsSchema.parse(body);
    const tenant = await this.currentTenant();
    await this.prisma.tenant.update({ where: { id: tenant.id }, data: { settings } });
    await this.audit.record({
      tenantId: tenant.id,
      userId: actor.id,
      action: 'TENANT_SETTINGS_UPDATED',
      resourceType: 'tenants',
      resourceId: tenant.id,
      oldValues: tenant.settings,
      newValues: settings,
    });
    return { settings };
  }

  @Get('branding')
  @RequirePermissions('config:manage_tenant')
  async getBranding() {
    const tenant = await this.currentTenant();
    return { branding: tenantBrandingSchema.parse(tenant.branding ?? {}) };
  }

  @Put('branding')
  @RequirePermissions('config:manage_tenant')
  async putBranding(@CurrentUser() actor: AuthUser, @Body() body: unknown) {
    const branding = tenantBrandingSchema.parse(body);
    const tenant = await this.currentTenant();
    await this.prisma.tenant.update({ where: { id: tenant.id }, data: { branding } });
    await this.audit.record({
      tenantId: tenant.id,
      userId: actor.id,
      action: 'TENANT_BRANDING_UPDATED',
      resourceType: 'tenants',
      resourceId: tenant.id,
      oldValues: tenant.branding,
      newValues: branding,
    });
    return { branding };
  }

  private async currentTenant() {
    // `tenants` no esta bajo RLS; el id sale del contexto autenticado.
    return this.prisma.tenant.findUniqueOrThrow({ where: { id: this.prisma.currentTenantId } });
  }
}
