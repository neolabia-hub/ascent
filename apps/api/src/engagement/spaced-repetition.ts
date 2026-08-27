/**
 * REPETICION ESPACIADA (Decision #22). Motor determinista tipo Leitner: 2, 7, 14 y 30 dias.
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
 */

/** Dias hasta la siguiente aparicion, por escalon. El escalon 0 es "recien fallada". */
export const REVIEW_INTERVALS_DAYS = [1, 2, 7, 14, 30] as const;

export const MAX_STAGE = REVIEW_INTERVALS_DAYS.length - 1;

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

function clampStage(stage: number): number {
  return Math.min(Math.max(stage, 0), MAX_STAGE);
}

/** Cuando debe reaparecer una pregunta que esta en cierto escalon. */
export function dueAtForStage(stage: number, from: Date): Date {
  return addDays(from, REVIEW_INTERVALS_DAYS[clampStage(stage)] as number);
}

/** Entrada a la cola: una pregunta fallada vuelve al dia siguiente. */
export function enterQueue(now: Date): ReviewTransition {
  return { stage: 0, lapses: 1, retired: false, dueAt: dueAtForStage(0, now), lastResult: 'FAIL' };
}

/**
 * Resultado de responder una pregunta que ya estaba en la cola.
 *
 * Al fallar NO se vuelve al escalon 0 de golpe: se retrocede uno. Reiniciar del todo castiga
 * demasiado un descuido y llena la sesion diaria de la misma pregunta, que es justo lo que hace
 * que la gente abandone el repaso.
 */
export function nextState(current: ReviewState, correct: boolean, now: Date): ReviewTransition {
  if (!correct) {
    const stage = clampStage(current.stage - 1);
    return {
      stage,
      lapses: current.lapses + 1,
      retired: false,
      dueAt: dueAtForStage(stage, now),
      lastResult: 'FAIL',
    };
  }

  // Acertar en el ultimo escalon la da por dominada: deja de ocupar la sesion de repaso.
  if (current.stage >= MAX_STAGE) {
    return {
      stage: MAX_STAGE,
      lapses: current.lapses,
      retired: true,
      dueAt: dueAtForStage(MAX_STAGE, now),
      lastResult: 'PASS',
    };
  }

  const stage = clampStage(current.stage + 1);
  return { stage, lapses: current.lapses, retired: false, dueAt: dueAtForStage(stage, now), lastResult: 'PASS' };
}

/**
 * Tamano de la sesion de repaso del dia. Se acota a proposito: el compromiso con el colaborador
 * es "3 a 5 minutos", y una cola de 40 preguntas rompe ese compromiso y vacia la funcion.
 */
export const REVIEW_SESSION_SIZE = 5;
