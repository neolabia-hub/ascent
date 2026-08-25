import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PermissionCode } from '@neo-pulse/shared';
import { PERMISSIONS_KEY } from './decorators.js';
import type { AuthUser } from './types.js';

/** Evalua @RequirePermissions contra los permisos efectivos del usuario (rol + overrides). */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionCode[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user) throw new ForbiddenException({ code: 'FORBIDDEN' });

    const missing = required.filter((code) => !user.hasPermission(code));
    if (missing.length > 0) {
      throw new ForbiddenException({ code: 'MISSING_PERMISSIONS', missing });
    }
    return true;
  }
}
