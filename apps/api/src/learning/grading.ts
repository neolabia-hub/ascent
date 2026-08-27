import type { Prisma, QuestionType } from '@prisma/client';

/**
 * CALIFICACION. Vive aparte y sin base de datos a proposito: es la funcion que decide si alguien
 * aprobo una capacitacion obligatoria, asi que tiene que poder probarse a mano, caso por caso.
 *
 * Corre SIEMPRE en el servidor. La respuesta correcta nunca sale hacia el cliente
 * (`question-payload.toLearnerView`), de modo que responder desde el navegador no puede
 * adelantarse a esta decision.
 */

export type StoredAnswer = Prisma.JsonValue | null;

export interface GradableQuestion {
  qtype: QuestionType;
  /** Columna `correct` de la version de pregunta servida en el intento. */
  correct: Prisma.JsonValue;
  pointsPossible: number;
}

export interface QuestionGrade {
  /** Puntos obtenidos, o null si la pregunta la debe calificar una persona (ESSAY). */
  pointsAwarded: number | null;
  needsManualGrading: boolean;
  /** Contesto bien del todo. Alimenta la cola de repaso: lo fallado vuelve. */
  correct: boolean;
}

function asRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Califica UNA pregunta. Sin respuesta = cero, nunca un error: no responder es una decision. */
export function gradeQuestion(question: GradableQuestion, answer: StoredAnswer): QuestionGrade {
  const correct = asRecord(question.correct);
  const given = asRecord(answer);

  switch (question.qtype) {
    case 'SINGLE': {
      const isCorrect = typeof given.optionId === 'string' && given.optionId === correct.optionId;
      return { pointsAwarded: isCorrect ? question.pointsPossible : 0, needsManualGrading: false, correct: isCorrect };
    }

    case 'TRUE_FALSE': {
      const isCorrect = typeof given.value === 'boolean' && given.value === correct.value;
      return { pointsAwarded: isCorrect ? question.pointsPossible : 0, needsManualGrading: false, correct: isCorrect };
    }

    case 'MULTI': {
      const expected = new Set(Array.isArray(correct.optionIds) ? (correct.optionIds as string[]) : []);
      const chosen = new Set(Array.isArray(given.optionIds) ? (given.optionIds as string[]) : []);
      const hits = [...chosen].filter((id) => expected.has(id)).length;
      const misses = [...chosen].filter((id) => !expected.has(id)).length;
      const exact = hits === expected.size && misses === 0;

      if (exact) {
        return { pointsAwarded: question.pointsPossible, needsManualGrading: false, correct: true };
      }
      if (!correct.partialCredit || expected.size === 0) {
        // Sin credito parcial se exige el conjunto EXACTO: marcar todo no puede valer nada.
        return { pointsAwarded: 0, needsManualGrading: false, correct: false };
      }
      // Con credito parcial, cada acierto suma y cada error de mas resta lo mismo. Nunca negativo.
      const ratio = Math.max(0, (hits - misses) / expected.size);
      return {
        pointsAwarded: Math.round(question.pointsPossible * ratio * 100) / 100,
        needsManualGrading: false,
        correct: false,
      };
    }

    case 'ESSAY':
      // La califica una persona (attempts:grade_manual). El intento queda PENDIENTE de revision.
      return { pointsAwarded: null, needsManualGrading: true, correct: false };
  }
}

export interface AttemptScore {
  /** Porcentaje 0-100 con un decimal. Es lo que se compara contra la nota minima. */
  score: number;
  passed: boolean;
  /** Si alguna pregunta espera calificacion humana, el intento no tiene nota final aun. */
  pending: boolean;
}

export interface GradedQuestionRow {
  pointsPossible: number;
  pointsAwarded: number | null;
  invalidated: boolean;
}

/**
 * Nota del intento. Las preguntas ANULADAS (una pregunta defectuosa que se retira) salen del
 * numerador y del denominador: no castigan ni regalan puntos a quien le toco.
 */
export function scoreAttempt(rows: GradedQuestionRow[], passingScore: number): AttemptScore {
  const live = rows.filter((row) => !row.invalidated);
  const pending = live.some((row) => row.pointsAwarded === null);
  const possible = live.reduce((sum, row) => sum + row.pointsPossible, 0);
  const awarded = live.reduce((sum, row) => sum + (row.pointsAwarded ?? 0), 0);

  // Un examen sin preguntas vivas no aprueba a nadie por omision.
  const score = possible > 0 ? Math.round((awarded / possible) * 1000) / 10 : 0;
  return { score, passed: !pending && possible > 0 && score >= passingScore, pending };
}

export type GradingPolicy = 'HIGHEST' | 'LAST' | 'FIRST' | 'AVERAGE';

export interface AttemptOutcome {
  attemptNumber: number;
  score: number;
  passed: boolean;
}

/**
 * Nota final cuando hubo varios intentos. La politica la fija la evaluacion (por defecto, la mas
 * alta) y se aplica igual para todos: es una regla academica, no una concesion caso a caso.
 */
export function applyGradingPolicy(attempts: AttemptOutcome[], policy: GradingPolicy): AttemptOutcome | null {
  const graded = [...attempts].sort((a, b) => a.attemptNumber - b.attemptNumber);
  if (graded.length === 0) return null;

  switch (policy) {
    case 'FIRST':
      return graded[0] as AttemptOutcome;
    case 'LAST':
      return graded[graded.length - 1] as AttemptOutcome;
    case 'AVERAGE': {
      const average = graded.reduce((sum, attempt) => sum + attempt.score, 0) / graded.length;
      const score = Math.round(average * 10) / 10;
      return {
        attemptNumber: (graded[graded.length - 1] as AttemptOutcome).attemptNumber,
        score,
        // Aprobar por promedio exige que el promedio alcance, no que un intento suelto lo hiciera.
        passed: graded.some((attempt) => attempt.passed) && score >= minimumOf(graded),
      };
    }
    case 'HIGHEST':
      return graded.reduce((best, attempt) => (attempt.score > best.score ? attempt : best), graded[0] as AttemptOutcome);
  }
}

/** Nota minima implicita: el corte mas bajo con el que algun intento aprobo. */
function minimumOf(attempts: AttemptOutcome[]): number {
  const approved = attempts.filter((attempt) => attempt.passed).map((attempt) => attempt.score);
  return approved.length > 0 ? Math.min(...approved) : Number.POSITIVE_INFINITY;
}

/**
 * Deteccion de "click siguiente" (negocio 3.6): terminar un examen en un tiempo imposible no
 * bloquea —seria injusto con quien de verdad sabe— pero queda MARCADO para revision.
 */
export function detectAnomalies(
  elapsedSeconds: number,
  questionCount: number,
  minSecondsPerQuestion = 5,
): { tooFast: boolean; elapsedSeconds: number; expectedMinimum: number } {
  const expectedMinimum = questionCount * minSecondsPerQuestion;
  return { tooFast: elapsedSeconds < expectedMinimum, elapsedSeconds, expectedMinimum };
}
