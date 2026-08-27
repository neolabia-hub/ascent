/**
 * A donde entra cada persona despues de iniciar sesion.
 *
 * NEO PULSE tiene dos superficies distintas (skill pulse-ui, seccion 2) y la mayoria del personal
 * operativo solo puede ver una: el rol Usuario tiene UN permiso, `enrollments:read_own`. Mandarlo
 * al panel de administracion seria mandarlo a una pantalla en la que todo esta prohibido.
 *
 * El criterio es por permisos y no por nombre de rol: los roles son configurables por tenant, los
 * permisos no.
 */

/** Lo que puede tener alguien que SOLO es aprendiz. */
const LEARNER_ONLY_PERMISSIONS = new Set(['enrollments:read_own']);

export const LEARNER_HOME = '/hoy';
export const ADMIN_HOME = '/inicio';

export function isLearnerOnly(permissions: readonly string[]): boolean {
  return permissions.length > 0 && permissions.every((permission) => LEARNER_ONLY_PERMISSIONS.has(permission));
}

export function landingFor(permissions: readonly string[]): string {
  return isLearnerOnly(permissions) ? LEARNER_HOME : ADMIN_HOME;
}
