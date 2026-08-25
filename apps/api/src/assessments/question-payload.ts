import type { Prisma, QuestionType } from '@prisma/client';
import type { QuestionPayload } from '@neo-pulse/shared';

/**
 * Traduccion entre el CONTRATO de pregunta (union discriminada de Zod, lo que maneja la UI) y
 * las COLUMNAS de `question_versions` (qtype, stem, options, correct, feedback, points).
 *
 * Se aisla aqui a proposito: es el unico punto del sistema que sabe donde vive la respuesta
 * correcta, y asi es imposible que un `select` descuidado la exponga desde otro servicio.
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
  }
}

/**
 * Vista SEGURA para presentar una pregunta a quien la responde: sin `correct` y sin la
 * retroalimentacion que delata la respuesta. Es la unica forma en que una pregunta debe salir
 * hacia el reproductor de evaluaciones.
 */
export function toLearnerView(version: StoredQuestionVersion & { id: string }) {
  const options = (Array.isArray(version.options) ? version.options : []) as unknown as StoredOption[];
  return {
    questionVersionId: version.id,
    qtype: version.qtype,
    stem: version.stem,
    // Se elimina el feedback por opcion: revelaria cual es la correcta antes de responder.
    options: options.map((option) => ({ id: option.id, text: option.text })),
    points: Number(version.points),
  };
}
