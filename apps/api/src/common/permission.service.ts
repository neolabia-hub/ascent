import { Injectable } from '@nestjs/common';
import type { PermissionCode } from '@neo-pulse/shared';
import type { AnalystScope } from './analyst-scope.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Permisos efectivos = permisos del rol + overrides(granted) - overrides(revocado).
 * Regla de oro (Decision #19): los guards evaluan SOLO codigos de permiso, nunca nombres de rol.
 * El ambito del Analista (analyst_scopes) se CARGA aqui y se APLICA en los queries de cada
 * feature (ver common/analyst-scope.ts). Son dos preguntas distintas: que puede hacer, y sobre
 * que parte de la empresa.
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

  /**
   * Procesos que esta persona puede ver. `null` = sin restriccion: TENER filas es lo que restringe.
   *
   * El alcance se da de DOS formas y la diferencia es justo la que pedia el negocio (Decision #57):
   *
   *   - sobre un PROCESO  → solo ese. Es el responsable de SARLAFT.
   *   - sobre un AREA     → todos los procesos que cuelgan de ella, y de las areas que cuelgan de
   *                         ella. Es la jefatura de SGI, que necesita ver como va todo lo suyo
   *                         —SARLAFT, SST, PESV— sin que cada uno vea lo del otro.
   *
   * El arbol de areas se recorre en memoria y no con SQL recursivo a proposito: son una decena de
   * filas por tenant, y el SQL crudo no pasa por el cliente atado al tenant (RLS).
   */
  async getAnalystScope(userId: string, tenantId: string): Promise<AnalystScope> {
    const prisma = this.prisma.forTenant(tenantId);
    const rows = await prisma.analystScope.findMany({
      where: { userId },
      select: { processId: true, areaId: true },
    });
    if (rows.length === 0) return null;

    const processIds = new Set(rows.map((row) => row.processId).filter((id): id is string => id !== null));
    const areaIds = rows.map((row) => row.areaId).filter((id): id is string => id !== null);

    if (areaIds.length > 0) {
      const areas = await prisma.area.findMany({ select: { id: true, parentId: true } });
      const reach = withDescendants(areas, areaIds);
      const owned = await prisma.process.findMany({ where: { areaId: { in: [...reach] } }, select: { id: true } });
      for (const process of owned) processIds.add(process.id);
    }

    // Puede quedar vacio: alcance sobre un area a la que todavia no se le colgo ningun proceso.
    // Se devuelve vacio y no `null`, porque "no tienes nada asignado" no es "puedes verlo todo".
    return [...processIds];
  }
}

/**
 * Las areas pedidas MAS todo lo que cuelga de ellas.
 *
 * Hace falta porque las areas anidan (`areas.parent_id`): dar alcance sobre SGI y que no
 * alcanzara a sus subareas convertiria el alcance en una lista que hay que mantener a mano cada
 * vez que la empresa reorganiza algo, y esa lista se queda vieja el primer mes.
 *
 * Itera hasta que deja de crecer en lugar de recursar, para que un padre mal capturado que se
 * apunte a si mismo no cuelgue el proceso entero.
 */
export function withDescendants(areas: Array<{ id: string; parentId: string | null }>, roots: string[]): Set<string> {
  const reach = new Set(roots);
  let grew = true;
  while (grew) {
    grew = false;
    for (const area of areas) {
      if (area.parentId && reach.has(area.parentId) && !reach.has(area.id)) {
        reach.add(area.id);
        grew = true;
      }
    }
  }
  return reach;
}
