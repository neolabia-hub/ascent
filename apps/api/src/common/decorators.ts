import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { PermissionCode } from '@neo-pulse/shared';
import type { AuthUser } from './types.js';

export const IS_PUBLIC_KEY = 'isPublic';
/** Marca un endpoint como publico (sin JWT): health, login, refresh, verificacion de certificados. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = 'requiredPermissions';
/** Permisos requeridos (el guard exige TODOS). Regla de oro: nunca nombres de rol. */
export const RequirePermissions = (...codes: PermissionCode[]) => SetMetadata(PERMISSIONS_KEY, codes);

/** Inyecta el AuthUser de la request en el parametro del handler. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
  return req.user;
});
