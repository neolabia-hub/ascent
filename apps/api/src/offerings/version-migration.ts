/**
 * QUIEN SE MUEVE Y QUIEN NO al apuntar una convocatoria a una version mas nueva.
 *
 * Vive aparte y sin base de datos a proposito: es el limite entre actualizar el contenido y
 * borrarle el avance a alguien, y tiene que poder revisarse sin leer una consulta de Prisma.
 *
 * La POLITICA la eligio quien publico la version destino, y manda. Por encima de ella hay dos
 * frenos que ninguna politica levanta:
 *
 *  - CONGELADO: una ejecucion cerrada (completada, aprobada, reprobada, retirada o vencida) es
 *    evidencia. Lo que alguien curso tiene que seguir diciendo lo que decia (regla de oro 4).
 *  - CONFLICTO: si la persona ya tiene otra ejecucion abierta de la version destino, moverla la
 *    dejaria con dos de la misma version y el reproductor no sabria en cual guardar el avance.
 *    Se queda donde esta y se REPORTA; romperlo en silencio seria peor.
 */

export type MigrationPolicy = 'FINISH_OLD' | 'RESTART_NEW' | 'MOVE_NOT_STARTED';

export const FROZEN_ENROLLMENT_STATUSES = ['COMPLETED', 'PASSED', 'FAILED', 'WITHDRAWN', 'EXPIRED'] as const;

export interface MigrationCandidate {
  id: string;
  userId: string;
  status: string;
  activityVersionId: string;
  /** Tiene avance o intentos: ya abrio la formacion. */
  started: boolean;
  /** Ya tiene otra ejecucion abierta de la version destino, en otra convocatoria. */
  hasOtherEnrollmentOnTarget: boolean;
}

export interface MigrationPlan<T> {
  moving: T[];
  counts: {
    total: number;
    moving: number;
    keepOldVersion: number;
    frozen: number;
    alreadyOnTarget: number;
    conflicted: number;
  };
}

const isFrozen = (status: string): boolean =>
  (FROZEN_ENROLLMENT_STATUSES as readonly string[]).includes(status);

/**
 * Reparte a los inscritos en casillas que SUMAN el total: quien autoriza el cambio ve numeros que
 * cuadran, y no cuatro cifras que puedan solaparse.
 *
 * "Atras" es cualquier version que no sea la destino, no solo la inmediatamente anterior: con
 * FINISH_OLD aplicado dos veces pueden quedar rezagados de la v1 cuando la convocatoria ya iba
 * por la v2, y esos tambien tienen que aparecer en la cuenta.
 */
export function planVersionMigration<T extends MigrationCandidate>(
  enrollments: T[],
  targetVersionId: string,
  policy: MigrationPolicy,
): MigrationPlan<T> {
  const frozen = enrollments.filter((e) => isFrozen(e.status));
  const live = enrollments.filter((e) => !isFrozen(e.status));
  const alreadyOnTarget = live.filter((e) => e.activityVersionId === targetVersionId);
  const behind = live.filter((e) => e.activityVersionId !== targetVersionId);

  let candidates: T[];
  switch (policy) {
    case 'FINISH_OLD':
      candidates = [];
      break;
    case 'MOVE_NOT_STARTED':
      // "No empezado" es un hecho, no un estado: se comprueba que no haya avance ni intentos, y
      // no solo que la fila diga ENROLLED.
      candidates = behind.filter((e) => e.status === 'ENROLLED' && !e.started);
      break;
    case 'RESTART_NEW':
      candidates = behind;
      break;
  }

  const moving = candidates.filter((e) => !e.hasOtherEnrollmentOnTarget);

  return {
    moving,
    counts: {
      total: enrollments.length,
      moving: moving.length,
      keepOldVersion: behind.length - moving.length,
      frozen: frozen.length,
      alreadyOnTarget: alreadyOnTarget.length,
      conflicted: candidates.length - moving.length,
    },
  };
}
