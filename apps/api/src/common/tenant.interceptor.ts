import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { Observable } from 'rxjs';
import { CLS_TENANT_ID } from './request-context.js';
import type { AuthUser } from './types.js';

/**
 * TenantInterceptor (Decision #17) — Capa 1 de la defensa en profundidad multi-tenant.
 *
 * Corre DESPUES de los guards (req.user ya poblado por JwtAuthGuard) y guarda el tenantId del
 * usuario autenticado en el contexto CLS de la request. A partir de ahi, `PrismaService.scoped`
 * lee ese tenantId de forma AMBIENTAL y aplica RLS sin que cada handler tenga que pasarlo a mano
 * (elimina la clase de bug "olvide filtrar por tenant").
 *
 * Rutas publicas (@Public: health, login, refresh, tenant publico) no tienen req.user -> no se
 * setea tenantId; esos flujos usan `forTenant(tenantId)` explicito tras resolver el slug.
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(private readonly cls: ClsService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (req.user?.tenantId) this.cls.set(CLS_TENANT_ID, req.user.tenantId);
    return next.handle();
  }
}
