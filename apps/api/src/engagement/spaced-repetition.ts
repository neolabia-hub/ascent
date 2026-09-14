/**
 * REPETICION ESPACIADA (Decision #22). Motor determinista tipo Leitner.
 *
 * Por que determinista y no un algoritmo adaptativo con modelo: el objetivo no es exprimir la
 * curva del olvido de cada persona, sino que **lo que alguien fallo vuelva a aparecer**. Un
 * intervalo fijo hace exactamente eso, se puede explicar a un auditor en una frase y no necesita
 * datos de entrenamiento ni un LLM.
 *
 * Reglas:
 *  - una pregunta entra a la cola cuando se FALLA en un examen o en un repaso,
 *  - al acertarla, sube de escalon y se aleja en el tiempo,
 *  - al fallarla, baja de escalon y vuelve pronto (y se cuenta el tropiezo),
 *  - al acertarla en el ultimo escalon, sale de la cola: esta dominada (test out).
 *
 * ─── LOS ESCALONES SON DEL TENANT, NO DEL CODIGO (2026-09-14, `PENDIENTES` 5.1) ───
 *
 * `1, 2, 7, 14, 30` era una constante fija. Dejo de serlo porque **el compromiso que estos
 * numeros representan no es tecnico, es de negocio, y cambia de una empresa a otra**: una empresa
 * de logistica que forma en seguridad vial puede querer que una falla en "distancia de frenado"
 * vuelva en un dia y machaque una semana entera; una que forma en politicas internas puede
 * conformarse con un ciclo mas relajado. Es la MISMA clase de decision que ya vive en
 * `tenantSettingsSchema` — `minWatchPctDefault`, `efficacyDaysDefault` — y por la misma razon: la
 * toma quien conoce a su gente, no quien escribe el codigo.
 *
 * Por eso las funciones de aqui ya NO leen una constante del modulo: reciben `intervals` como
 * parametro. Quien llama (`EngagementService`) resuelve el settings del tenant una vez por
 * operacion, nunca por pregunta — leerlo en un bucle de 40 preguntas seria la misma clase de
 * error que ya se corrigio en `ejecucionDeActividad` con `estadosPorActividad`.
 */

export interface ReviewState {
  stage: number;
  lapses: number;
  retired: boolean;
}

export interface ReviewTransition extends ReviewState {
  dueAt: Date;
  lastResult: 'PASS' | 'FAIL';
}

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

function clampStage(stage: number, maxStage: number): number {
  return Math.min(Math.max(stage, 0), maxStage);
}

/** Cuando debe reaparecer una pregunta que esta en cierto escalon, segun los intervalos del tenant. */
export function dueAtForStage(stage: number, from: Date, intervals: readonly number[]): Date {
  const maxStage = intervals.length - 1;
  return addDays(from, intervals[clampStage(stage, maxStage)] as number);
}

/** Entrada a la cola: una pregunta fallada vuelve al primer escalon. */
export function enterQueue(now: Date, intervals: readonly number[]): ReviewTransition {
  return { stage: 0, lapses: 1, retired: false, dueAt: dueAtForStage(0, now, intervals), lastResult: 'FAIL' };
}

/**
 * Resultado de responder una pregunta que ya estaba en la cola.
 *
 * Al fallar NO se vuelve al escalon 0 de golpe: se retrocede uno. Reiniciar del todo castiga
 * demasiado un descuido y llena la sesion diaria de la misma pregunta, que es justo lo que hace
 * que la gente abandone el repaso.
 *
 * `intervals` tiene que ser EL MISMO con el que se creo o se actualizo por ultima vez el registro
 * — si el tenant cambia sus escalones a mitad de camino, la ronda en curso de cada pregunta sigue
 * su plan viejo hasta la proxima vez que se responda; no se recalculan las fechas ya fijadas. Es
 * una simplificacion deliberada: recalcular todo el historial vivo al cambiar una preferencia es
 * mas sorpresa que beneficio, y el efecto se autocorrige solo, pregunta a pregunta, con el uso.
 */
export function nextState(current: ReviewState, correct: boolean, now: Date, intervals: readonly number[]): ReviewTransition {
  const maxStage = intervals.length - 1;

  if (!correct) {
    const stage = clampStage(current.stage - 1, maxStage);
    return {
      stage,
      lapses: current.lapses + 1,
      retired: false,
      dueAt: dueAtForStage(stage, now, intervals),
      lastResult: 'FAIL',
    };
  }

  // Acertar en el ultimo escalon la da por dominada: deja de ocupar la sesion de repaso.
  if (current.stage >= maxStage) {
    return {
      stage: maxStage,
      lapses: current.lapses,
      retired: true,
      dueAt: dueAtForStage(maxStage, now, intervals),
      lastResult: 'PASS',
    };
  }

  const stage = clampStage(current.stage + 1, maxStage);
  return { stage, lapses: current.lapses, retired: false, dueAt: dueAtForStage(stage, now, intervals), lastResult: 'PASS' };
}

/**
 * Tamaño de la sesion de repaso del dia. Se acota a proposito: el compromiso con el colaborador
 * es "3 a 5 minutos", y una cola de 40 preguntas rompe ese compromiso y vacia la funcion.
 */
export const REVIEW_SESSION_SIZE = 5;
