import { Injectable } from '@nestjs/common';
import type { PermissionCode } from '@neo-pulse/shared';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Permisos efectivos = permisos del rol + overrides(granted) - overrides(revocado).
 * Regla de oro (Decision #19): los guards evaluan SOLO codigos de permiso, nunca nombres de rol.
 * El ambito del Analista (analyst_scopes) se aplica en los QUERIES de cada feature, no aqui.
 *
 * Cache: pendiente Redis TTL 5 min (Sprint 1); hoy computa desde DB por request.
 */
@Injectable()
export class PermissionService {
  constructor(private readonly prisma: PrismaService) {}

  async getEffectivePermissions(userId: string, tenantId: string): Promise<Set<PermissionCode>> {
    const user = await this.prisma.forTenant(tenantId).user.findUnique({
      where: { id: userId },
      select: {
        role: { select: { permissions: { select: { permission: { select: { code: true } } } } } },
        overrides: { select: { granted: true, permission: { select: { code: true } } } },
      },
    });
    if (!user) return new Set();

    const effective = new Set<PermissionCode>();
    for (const rp of user.role.permissions) effective.add(rp.permission.code as PermissionCode);
    for (const o of user.overrides) {
      const code = o.permission.code as PermissionCode;
      if (o.granted) effective.add(code);
      else effective.delete(code);
    }
    return effective;
  }
}
