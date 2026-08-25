import type { PermissionCode } from '@neo-pulse/shared';

/** Payload del access token (JWT RS256). */
export interface JwtPayload {
  sub: string;
  tenantId: string;
  roleId: string;
  email: string;
}

/** Usuario autenticado adjunto a la request por JwtStrategy. */
export interface AuthUser {
  id: string;
  tenantId: string;
  roleId: string;
  email: string;
  permissions: Set<PermissionCode>;
  hasPermission: (code: PermissionCode) => boolean;
}
