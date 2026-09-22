import type { PermissionCode } from '@neo-pulse/shared';
import type { AnalystScope } from './analyst-scope.js';

/** Payload del access token (JWT RS256). */
export interface JwtPayload {
  /** Cual de las sesiones de la persona es (Decision #91): permite cerrar solo esta. */
  sessionId?: string;
  sub: string;
  tenantId: string;
  roleId: string;
  /** `null` = esta persona no tiene correo. Entra con su cedula (ver `users.email` en el esquema). */
  email: string | null;
}

/** Usuario autenticado adjunto a la request por JwtStrategy. */
export interface AuthUser {
  id: string;
  tenantId: string;
  roleId: string;
  /** `null` = esta persona no tiene correo. Entra con su cedula (ver `users.email` en el esquema). */
  email: string | null;
  permissions: Set<PermissionCode>;
  hasPermission: (code: PermissionCode) => boolean;
  /** Procesos que puede ver. `null` = todos (ver common/analyst-scope.ts). */
  scopeProcessIds: AnalystScope;
  /**
   * Tipos de formacion que puede tocar. `null` = todos (2026-09-22).
   *
   * Tercera dimension del mismo alcance, con el mismo convenio: **sin filas no se acota**. Lo
   * resuelve `PermissionService.getActivityTypeScope`, donde esta escrita la precedencia entre lo
   * de la persona y lo de su rol.
   */
  scopeActivityTypeIds: string[] | null;
}
