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

/**
 * Normaliza una respuesta escrita a mano para poder compararla (Decision #86).
 *
 * Quita tildes, mayusculas y espacios de mas. Es a proposito y no una concesion: quien responde
 * esta escribiendo desde el telefono en una obra, y suspender a alguien por teclear "arnes" sin
 * tilde seria medir ortografia en vez de seguridad. Lo que de verdad haya que exigir se exige
 * anadiendo esa forma a la lista de respuestas aceptadas.
 */
function normalizar(value: string): string {
  return (
    value
      .normalize('NFD')
      // Las marcas diacriticas que NFD acaba de separar de su letra.
      .replace(/[̀-ͯ]/g, '')
      .trim()
      .toLowerCase()
      // Espacios de mas EN MEDIO: "seis   meses" y "seis meses" son la misma respuesta.
      .replace(/\s+/g, ' ')
  );
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

    /**
     * COMPLETAR HUECOS. Cada hueco se compara NORMALIZADO —sin tildes, sin mayusculas y sin
     * espacios de mas— contra su lista de respuestas validas.
     *
     * Es una decision de fondo, no una comodidad: quien responde esta escribiendo desde el
     * telefono en una obra, y suspender a un conductor por escribir "arnes" sin tilde seria medir
     * ortografia en vez de seguridad. Lo que hay que exigir de verdad se exige poniendo la forma
     * completa en la lista de aceptadas.
     */
    case 'FILL_BLANK': {
      const blanks = Array.isArray(correct.blanks)
        ? (correct.blanks as Array<{ id: string; accept: string[] }>)
        : [];
      const written = asRecord((given.blanks ?? null) as Prisma.JsonValue);
      if (blanks.length === 0) {
        return { pointsAwarded: 0, needsManualGrading: false, correct: false };
      }
      const hits = blanks.filter((blank) => {
        const value = normalizar(String(written[blank.id] ?? ''));
        if (!value) return false;
        return (blank.accept ?? []).some((accepted) => normalizar(accepted) === value);
      }).length;

      if (hits === blanks.length) {
        return { pointsAwarded: question.pointsPossible, needsManualGrading: false, correct: true };
      }
      if (correct.partialCredit === false) {
        return { pointsAwarded: 0, needsManualGrading: false, correct: false };
      }
      return {
        pointsAwarded: Math.round(question.pointsPossible * (hits / blanks.length) * 100) / 100,
        needsManualGrading: false,
        correct: false,
      };
    }

    /**
     * ORDENAR. El credito parcial cuenta los pasos que quedaron EN SU SITIO, y no las parejas
     * consecutivas correctas: es lo que se puede explicar en una frase a quien reclama la nota
     * ("cuatro de los siete pasos estaban en su lugar"), y una metrica que no se puede explicar
     * no sirve en una auditoria.
     */
    case 'ORDER': {
      const expected = Array.isArray(correct.order) ? (correct.order as string[]) : [];
      const dado = Array.isArray(given.order) ? (given.order as string[]) : [];
      if (expected.length === 0) {
        return { pointsAwarded: 0, needsManualGrading: false, correct: false };
      }
      const enSuSitio = expected.filter((id, index) => dado[index] === id).length;
      if (enSuSitio === expected.length) {
        return { pointsAwarded: question.pointsPossible, needsManualGrading: false, correct: true };
      }
      if (correct.partialCredit === false) {
        return { pointsAwarded: 0, needsManualGrading: false, correct: false };
      }
      return {
        pointsAwarded: Math.round(question.pointsPossible * (enSuSitio / expected.length) * 100) / 100,
        needsManualGrading: false,
        correct: false,
      };
    }

    /** EMPAREJAR. Cada pareja acertada suma; las que se dejan sin unir cuentan como falladas. */
    case 'MATCH': {
      const expected = asRecord((correct.pairs ?? null) as Prisma.JsonValue) as Record<string, string>;
      const dado = asRecord((given.pairs ?? null) as Prisma.JsonValue) as Record<string, string>;
      const claves = Object.keys(expected);
      if (claves.length === 0) {
        return { pointsAwarded: 0, needsManualGrading: false, correct: false };
      }
      const hits = claves.filter((left) => dado[left] === expected[left]).length;
      if (hits === claves.length) {
        return { pointsAwarded: question.pointsPossible, needsManualGrading: false, correct: true };
      }
      if (correct.partialCredit === false) {
        return { pointsAwarded: 0, needsManualGrading: false, correct: false };
      }
      return {
        pointsAwarded: Math.round(question.pointsPossible * (hits / claves.length) * 100) / 100,
        needsManualGrading: false,
        correct: false,
      };
    }

    /**
     * NUMERICA. Dentro de la tolerancia o fuera: no hay credito parcial, porque "casi" no
     * significa nada en una distancia de seguridad. La tolerancia se compara con un epsilon
     * minimo para que 1,5 con tolerancia 0 no falle por como se representan los decimales.
     */
    case 'NUMERIC': {
      const esperado = Number(correct.number ?? 0);
      const tolerancia = Number(correct.tolerance ?? 0);
      const dado = typeof given.number === 'number' ? given.number : Number.NaN;
      const acierta = Number.isFinite(dado) && Math.abs(dado - esperado) <= tolerancia + 1e-9;
      return { pointsAwarded: acierta ? question.pointsPossible : 0, needsManualGrading: false, correct: acierta };
    }

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
