import type { PermissionCode } from '@neo-pulse/shared';
import type { AnalystScope } from './analyst-scope.js';

/** Payload del access token (JWT RS256). */
export interface JwtPayload {
  /** Cual de las sesiones de la persona es (Decision #91): permite cerrar solo esta. */
  sessionId?: string;
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
  /** Procesos que puede ver. `null` = todos (ver common/analyst-scope.ts). */
  scopeProcessIds: AnalystScope;
}
