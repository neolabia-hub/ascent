import type { Prisma, QuestionType } from '@prisma/client';
import type { QuestionPayload } from '@neo-pulse/shared';

/**
 * Traduccion entre el CONTRATO de pregunta (union discriminada de Zod, lo que maneja la UI) y
 * las COLUMNAS de `question_versions` (qtype, stem, options, correct, feedback, points).
 *
 * Se aisla aqui a proposito: es el unico punto del sistema que sabe donde vive la respuesta
 * correcta, y asi es imposible que un `select` descuidado la exponga desde otro servicio.
 *
 * LA INVARIANTE que sostiene todo esto (y que los tipos nuevos de la Decision #86 respetan):
 * `options` es SIEMPRE un array de `{ id, text }`, y `correct` es SIEMPRE lo que no puede salir.
 * Gracias a eso, el barajado por intento (`optionsOrder`) y `toLearnerView` siguen sirviendo para
 * los ocho tipos sin un solo caso especial.
 *
 * Como se acomoda cada tipo nuevo a esa invariante:
 *
 *   FILL_BLANK  `options` = un hueco por entrada, en el orden del enunciado. El TEXTO de la
 *               entrada es la pista opcional, nunca la respuesta. Las respuestas validas van en
 *               `correct.blanks`.
 *   ORDER       `options` = los pasos. El orden correcto va en `correct.order`; lo que se sirve
 *               va siempre barajado.
 *   MATCH       `options` = las dos columnas en la MISMA lista, con prefijo: `L*` a la izquierda
 *               y `R*` a la derecha. Los ids de una columna no dicen nada de la otra —el
 *               emparejamiento vive en `correct.pairs`—, asi que ver la lista no resuelve la
 *               pregunta. Si `L1` emparejara con `R1`, se resolveria leyendo el HTML.
 *   NUMERIC     `options` = vacio. La UNIDAD si sale al cliente (se ensena junto al campo), y por
 *               eso `toLearnerView` la copia explicitamente desde `correct`: sin ella, "1,5" y
 *               "150" parecen respuestas distintas a la misma pregunta.
 */

export interface QuestionVersionColumns {
  qtype: QuestionType;
  stem: string;
  options: Prisma.InputJsonValue;
  correct: Prisma.InputJsonValue;
  feedback: Prisma.InputJsonValue;
  points: number;
}

export function payloadToColumns(payload: QuestionPayload): QuestionVersionColumns {
  switch (payload.qtype) {
    case 'SINGLE':
      return {
        qtype: 'SINGLE',
        stem: payload.stem,
        options: payload.options,
        correct: { optionId: payload.correctOptionId },
        feedback: { explanation: payload.explanation ?? null },
        points: payload.points,
      };
    case 'MULTI':
      return {
        qtype: 'MULTI',
        stem: payload.stem,
        options: payload.options,
        correct: { optionIds: payload.correctOptionIds, partialCredit: payload.partialCredit },
        feedback: { explanation: payload.explanation ?? null },
        points: payload.points,
      };
    case 'TRUE_FALSE':
      return {
        qtype: 'TRUE_FALSE',
        stem: payload.stem,
        options: [],
        correct: { value: payload.correctValue },
        feedback: { explanation: payload.explanation ?? null },
        points: payload.points,
      };
    case 'ESSAY':
      return {
        qtype: 'ESSAY',
        stem: payload.stem,
        options: [],
        // Sin respuesta automatica: la califica una persona (attempts:grade_manual).
        correct: {},
        feedback: { rubric: payload.rubric ?? null },
        points: payload.points,
      };

    case 'FILL_BLANK':
      return {
        qtype: 'FILL_BLANK',
        stem: payload.stem,
        // Un hueco por entrada. El texto queda vacio: lo que se ve es el enunciado, no esto.
        options: payload.blanks.map((blank) => ({ id: blank.id, text: '' })),
        correct: {
          blanks: payload.blanks.map((blank) => ({ id: blank.id, accept: blank.accept })),
          partialCredit: payload.partialCredit,
        },
        feedback: { explanation: payload.explanation ?? null },
        points: payload.points,
      };

    case 'ORDER':
      return {
        qtype: 'ORDER',
        stem: payload.stem,
        options: payload.items,
        correct: { order: payload.correctOrder, partialCredit: payload.partialCredit },
        feedback: { explanation: payload.explanation ?? null },
        points: payload.points,
      };

    case 'MATCH':
      return {
        qtype: 'MATCH',
        stem: payload.stem,
        // Las dos columnas en la misma lista con prefijo. Ver la nota de arriba sobre por que los
        // ids de una columna no pueden ser los mismos que los de la otra.
        options: [
          ...payload.pairs.map((pair, i) => ({ id: `L${i + 1}`, text: pair.left })),
          ...payload.pairs.map((pair, i) => ({ id: `R${i + 1}`, text: pair.right })),
        ],
        correct: {
          pairs: Object.fromEntries(payload.pairs.map((_, i) => [`L${i + 1}`, `R${i + 1}`])),
          partialCredit: payload.partialCredit,
        },
        feedback: { explanation: payload.explanation ?? null },
        points: payload.points,
      };

    case 'NUMERIC':
      return {
        qtype: 'NUMERIC',
        stem: payload.stem,
        options: [],
        correct: { number: payload.correctNumber, tolerance: payload.tolerance, unit: payload.unit ?? null },
        feedback: { explanation: payload.explanation ?? null },
        points: payload.points,
      };
  }
}

interface StoredQuestionVersion {
  qtype: QuestionType;
  stem: string;
  options: Prisma.JsonValue;
  correct: Prisma.JsonValue;
  feedback: Prisma.JsonValue;
  points: Prisma.Decimal | number;
}

interface StoredOption {
  id: string;
  text: string;
  feedback?: string;
}

/**
 * Reconstruye el contrato COMPLETO (con la respuesta correcta) para la pantalla de edicion del
 * banco. Solo debe llamarse en endpoints protegidos con `questions:manage`.
 */
export function columnsToPayload(version: StoredQuestionVersion): QuestionPayload {
  const options = (Array.isArray(version.options) ? version.options : []) as unknown as StoredOption[];
  const correct = (version.correct ?? {}) as Record<string, unknown>;
  const feedback = (version.feedback ?? {}) as { explanation?: string | null; rubric?: string | null };
  const points = Number(version.points);

  switch (version.qtype) {
    case 'SINGLE':
      return {
        qtype: 'SINGLE',
        stem: version.stem,
        options,
        correctOptionId: String(correct.optionId ?? ''),
        points,
        explanation: feedback.explanation ?? undefined,
      };
    case 'MULTI':
      return {
        qtype: 'MULTI',
        stem: version.stem,
        options,
        correctOptionIds: Array.isArray(correct.optionIds) ? (correct.optionIds as string[]) : [],
        partialCredit: Boolean(correct.partialCredit),
        points,
        explanation: feedback.explanation ?? undefined,
      };
    case 'TRUE_FALSE':
      return {
        qtype: 'TRUE_FALSE',
        stem: version.stem,
        correctValue: Boolean(correct.value),
        points,
        explanation: feedback.explanation ?? undefined,
      };
    case 'ESSAY':
      return {
        qtype: 'ESSAY',
        stem: version.stem,
        rubric: feedback.rubric ?? undefined,
        points,
      };

    case 'FILL_BLANK':
      return {
        qtype: 'FILL_BLANK',
        stem: version.stem,
        blanks: Array.isArray(correct.blanks)
          ? (correct.blanks as Array<{ id: string; accept: string[] }>).map((blank) => ({
              id: String(blank.id),
              accept: Array.isArray(blank.accept) ? blank.accept.map(String) : [],
            }))
          : [],
        partialCredit: correct.partialCredit !== false,
        points,
        explanation: feedback.explanation ?? undefined,
      };

    case 'ORDER':
      return {
        qtype: 'ORDER',
        stem: version.stem,
        items: options,
        correctOrder: Array.isArray(correct.order) ? (correct.order as string[]) : options.map((item) => item.id),
        partialCredit: correct.partialCredit !== false,
        points,
        explanation: feedback.explanation ?? undefined,
      };

    case 'MATCH': {
      // Se rearman las parejas juntando `L*` con el `R*` que dice `correct.pairs`.
      const pares = (correct.pairs ?? {}) as Record<string, string>;
      const porId = new Map(options.map((option) => [option.id, option.text]));
      return {
        qtype: 'MATCH',
        stem: version.stem,
        pairs: options
          .filter((option) => option.id.startsWith('L'))
          .map((option, i) => ({
            id: String(i + 1),
            left: option.text,
            right: porId.get(pares[option.id] ?? '') ?? '',
          })),
        partialCredit: correct.partialCredit !== false,
        points,
        explanation: feedback.explanation ?? undefined,
      };
    }

    case 'NUMERIC':
      return {
        qtype: 'NUMERIC',
        stem: version.stem,
        correctNumber: Number(correct.number ?? 0),
        tolerance: Number(correct.tolerance ?? 0),
        unit: typeof correct.unit === 'string' && correct.unit ? correct.unit : undefined,
        points,
        explanation: feedback.explanation ?? undefined,
      };
  }
}

/**
 * Vista SEGURA para presentar una pregunta a quien la responde: sin `correct` y sin la
 * retroalimentacion que delata la respuesta. Es la unica forma en que una pregunta debe salir
 * hacia el reproductor de evaluaciones.
 */
export function toLearnerView(version: StoredQuestionVersion & { id: string }) {
  const options = (Array.isArray(version.options) ? version.options : []) as unknown as StoredOption[];
  const correct = (version.correct ?? {}) as Record<string, unknown>;
  return {
    questionVersionId: version.id,
    qtype: version.qtype,
    stem: version.stem,
    // Se elimina el feedback por opcion: revelaria cual es la correcta antes de responder.
    options: options.map((option) => ({ id: option.id, text: option.text })),
    /*
      LA UNICA COSA QUE SALE DE `correct`, y es deliberada: la unidad de una pregunta numerica.
      Sin ella la pregunta es ambigua ("¿1,5 que? ¿metros o centimetros?") y no delata nada — el
      numero, que es la respuesta, se queda aqui dentro.
    */
    unit: version.qtype === 'NUMERIC' && typeof correct.unit === 'string' ? correct.unit : undefined,
    points: Number(version.points),
  };
}
