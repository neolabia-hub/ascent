import { LEARNER_ONLY_PERMISSIONS } from '@neo-pulse/shared';

/**
 * A donde entra cada persona despues de iniciar sesion, y si ve la puerta de vuelta al panel.
 *
 * ASCENT tiene dos superficies distintas (skill pulse-ui, seccion 2) y la mayoria del personal
 * operativo solo puede ver una. Mandar a esa gente al panel de administracion es mandarla a una
 * pantalla en la que todo esta prohibido.
 *
 * El criterio es por PERMISOS y no por nombre de rol: los roles son configurables por tenant, los
 * permisos no (Decision #19). Un cliente puede llamar «Asistente» o «Coordinador HSE» a su rol que
 * gestiona; lo que decide es lo que ese rol CONCEDE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA LISTA YA NO VIVE AQUI, y esa es la correccion del 2026-09-10.
 *
 * Estaba escrita en este archivo y tenia UN elemento: `enrollments:read_own`. Cuando el rol
 * Usuario crecio a tres permisos —le llegaron `performance:read_own` y `attendance:sign`— nadie
 * volvio a mirar esta lista, porque no hay nada que obligue a mirarla. Resultado: `isLearnerOnly`
 * pasaba a ser falso para un aprendiz corriente, asi que **un conductor iniciaba sesion y
 * aterrizaba en el panel de administracion**, y ademas le salia el conmutador de vuelta.
 *
 * Ninguna de las dos cosas dio un error. Las dos "funcionaban".
 *
 * Ahora la lista vive junto al catalogo de permisos, en `@neo-pulse/shared`, que es lo unico que la
 * puede dejar vieja, se deriva sola para los permisos `:read_own`, y hay una prueba que falla si el
 * rol Usuario de la semilla deja de ser enteramente «de lo suyo».
 */

const DE_LO_SUYO = new Set<string>(LEARNER_ONLY_PERMISSIONS);

export const LEARNER_HOME = '/hoy';
export const ADMIN_HOME = '/inicio';

export function isLearnerOnly(permissions: readonly string[]): boolean {
  return permissions.length > 0 && permissions.every((permission) => DE_LO_SUYO.has(permission));
}

export function landingFor(permissions: readonly string[]): string {
  return isLearnerOnly(permissions) ? LEARNER_HOME : ADMIN_HOME;
}

/**
 * ¿Esta persona administra ALGO, sea cual sea el nombre de su rol?
 *
 * Se define por descarte —tiene algun permiso que no sea «lo mio»— y no por una lista de permisos
 * de gestion, que habria que ampliar cada vez que el producto crece y que se quedaria vieja en
 * silencio.
 *
 * Se usa para ofrecer el camino de vuelta al panel desde la superficie del aprendiz: quien solo
 * tiene su formacion no debe ver una puerta a una pantalla donde todo esta prohibido.
 */
export function managesAnything(permissions: readonly string[]): boolean {
  return permissions.some((permission) => !DE_LO_SUYO.has(permission));
}
