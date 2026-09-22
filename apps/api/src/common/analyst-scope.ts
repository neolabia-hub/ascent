import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/**
 * ALCANCE DEL ANALISTA — la mitad del modelo que faltaba.
 *
 * El dominio dice desde el primer dia que el Analista gestiona SU proceso (SST, PESV, SARLAFT...)
 * y la tabla `analyst_scopes` existe y se guarda desde Sprint 1. Pero NINGUNA consulta la miraba:
 * un analista de SST abria el catalogo y veia las 52 capacitaciones de toda la empresa. Esto lo
 * cierra.
 *
 * LA REGLA, en una linea: **tener alcance es lo que restringe**. Un usuario SIN filas en
 * `analyst_scopes` ve el tenant entero (asi es el Administrador); uno CON filas ve solo esos
 * procesos, en el catalogo, en las convocatorias y en el plan.
 *
 * Por que asi y no inventando un permiso por modulo (`catalog:read_all` / `catalog:read_scope`):
 *  - El alcance no es una capacidad, es un ambito. "Puede leer el catalogo" y "que parte del
 *    catalogo es suya" son dos preguntas distintas; fundirlas obliga a duplicar cada permiso de
 *    lectura del producto y a mantener los dos sincronizados a mano para siempre.
 *  - Sigue respetando la Decision #19: aqui NO se mira el nombre del rol en ningun sitio. Se mira
 *    un dato del usuario, exactamente igual que los overrides individuales de permisos.
 *  - Es reversible desde la UI y sin desplegar: quitarle las filas a alguien le devuelve todo.
 *
 * Ambito de esta pieza: PROCESOS. Las filas de `analyst_scopes` que solo traen area acotan
 * personas (usuarios, inscripciones), no el catalogo, y se aplican donde toque cuando se cablee
 * esa mitad; por eso aqui un usuario con alcance solo de area no queda restringido en catalogo.
 */

/** Procesos que el usuario puede ver. `null` = sin restriccion (ve todo el tenant). */
export type AnalystScope = string[] | null;

/**
 * Interseccion entre el proceso que la pantalla pide filtrar y los que el usuario puede ver.
 *
 * El caso interesante es el tercero: si el analista de SST pide `?processId=<PESV>`, la respuesta
 * correcta NO es devolverle lo suyo —ignorar su filtro le mostraria SST mientras la pantalla dice
 * "PESV", que es mentirle— ni un 403 —que le confirma que ese proceso existe—. Es una lista vacia.
 */
export function processScopeWhere(
  scope: AnalystScope,
  requested?: string,
): { processId?: string | { in: string[] } } {
  if (!scope) return requested ? { processId: requested } : {};
  if (!requested) return { processId: { in: scope } };
  return { processId: scope.includes(requested) ? requested : { in: [] } };
}

/** El mismo filtro, colgado del camino convocatoria → version → actividad. */
export function offeringScopeWhere(scope: AnalystScope, requested?: string): Prisma.OfferingWhereInput {
  const inner = processScopeWhere(scope, requested);
  return Object.keys(inner).length ? { activityVersion: { activity: inner } } : {};
}

/**
 * ¿Puede este usuario ver algo de este proceso? Para fichas individuales.
 *
 * Quien la llama devuelve 404, no 403: un 403 sobre un id concreto confirma que ese id existe, y
 * el catalogo de otro proceso no es asunto suyo ni para saber que esta ahi.
 */
export function scopeAllows(scope: AnalystScope, processId: string): boolean {
  return scope === null || scope.includes(processId);
}

/**
 * Compuerta de ESCRITURA. Aqui si es 403 y no 404: el proceso lo escribio quien llama, en un
 * desplegable que ya vio, asi que no hay nada que ocultarle —hay algo que explicarle—.
 *
 * Cubre los dos lados. Crear fuera del alcance es evidente; MOVER algo propio a otro proceso lo es
 * menos y es el que de verdad se cuela: sin esta comprobacion, el analista de SST cambia el
 * proceso de su capacitacion a PESV, la pierde de vista y deja al de PESV con un renglon que no
 * pidio.
 */
export function assertScopeAllows(scope: AnalystScope, processId: string): void {
  if (scopeAllows(scope, processId)) return;
  throw new ForbiddenException({
    code: 'PROCESS_OUT_OF_SCOPE',
    message: 'Ese proceso no esta en tu alcance. Pidele al administrador que lo agregue.',
  });
}

/**
 * EL ALCANCE POR TIPO DE FORMACION (2026-09-22). Mismo convenio que el de procesos: `null` = sin
 * restriccion, y tener filas es lo que acota.
 *
 * Lo pidio el cliente —*"el analista solo debe poder crear tipo plan"*— pero no se cablea «PLAN»
 * en ningun sitio: que tipos puede tocar cada rol y cada persona se configura desde Permisos,
 * porque los tipos los crea el propio tenant y la siguiente empresa querra otra cosa.
 *
 * El mensaje NO enumera lo que si puede, a proposito: quien lo lee no puede arreglarlo solo, y la
 * lista de lo que no le toca no le sirve. Dice a quien pedirselo, que es lo unico accionable.
 */
export function tipoPermitido(scope: string[] | null, activityTypeId: string): boolean {
  return scope === null || scope.includes(activityTypeId);
}

export function assertTipoPermitido(scope: string[] | null, activityTypeId: string): void {
  if (tipoPermitido(scope, activityTypeId)) return;
  throw new ForbiddenException({
    code: 'ACTIVITY_TYPE_OUT_OF_SCOPE',
    message: 'No puedes crear formaciones de ese tipo. Pidele al administrador que te lo habilite.',
  });
}

/**
 * El filtro para las CONSULTAS: que tipos entran en lo que esta persona ve.
 *
 * ─── SE CRUZA CON LO QUE PIDE LA PANTALLA, NO SE PONE AL LADO ───
 *
 * Recibe el tipo pedido y devuelve UNA sola clave `activityTypeId`. Escribir el alcance y el filtro
 * como dos claves del mismo objeto no las suma: **la segunda pisa a la primera en silencio**, y el
 * alcance se pierde. Es exactamente el fallo que ya costo una tarde en la tajada de las
 * convocatorias (`projected-audience.service.ts`, 2026-09-04), asi que aqui no puede repetirse.
 *
 * Si alguien pide un tipo que no es suyo, la respuesta es una lista VACIA: devolverle lo suyo
 * mientras la pantalla dice otra cosa seria mentirle, y un 403 le confirma que ese tipo existe.
 *
 * Devuelve `{}` cuando no hay restriccion ni filtro —y no un `in` con todos los tipos— porque
 * enumerar todo obligaria a cargar el catalogo en cada consulta solo para decir «no filtres».
 */
export function tipoScopeWhere(
  scope: string[] | null,
  pedido?: string,
): { activityTypeId?: string | { in: string[] } } {
  if (scope === null) return pedido ? { activityTypeId: pedido } : {};
  if (!pedido) return { activityTypeId: { in: scope } };
  return { activityTypeId: { in: scope.includes(pedido) ? [pedido] : [] } };
}
