import { z } from 'zod';

/**
 * Contratos del BANCO DE PREGUNTAS y las EVALUACIONES (CLAUDE.md 3.6).
 *
 * Reglas duras del dominio:
 *  - La pregunta se VERSIONA: editar crea una version nueva; los intentos historicos apuntan a
 *    la version que realmente se sirvio (Decision #6/#7). Nunca se reescribe la historia.
 *  - `correct` JAMAS viaja al cliente en el contexto de rendir un examen. Solo se expone al
 *    editar el banco, con permiso questions:manage.
 */

export const questionTypeSchema = z.enum(['SINGLE', 'MULTI', 'TRUE_FALSE', 'ESSAY']);
export type QuestionType = z.infer<typeof questionTypeSchema>;

const answerOptionSchema = z.object({
  id: z.string().min(1).max(20),
  text: z.string().min(1).max(500),
  /** Retroalimentacion por opcion (por que esta opcion esta bien o mal). */
  feedback: z.string().max(300).optional(),
});

const singleQuestionSchema = z
  .object({
    qtype: z.literal('SINGLE'),
    stem: z.string().min(5).max(1000),
    options: z.array(answerOptionSchema).min(2).max(8),
    correctOptionId: z.string().min(1).max(20),
    points: z.number().min(0.1).max(100).default(1),
    explanation: z.string().max(1000).optional(),
  })
  .refine((q) => q.options.some((o) => o.id === q.correctOptionId), {
    message: 'La respuesta correcta debe ser una de las opciones',
    path: ['correctOptionId'],
  });

const multiQuestionSchema = z
  .object({
    qtype: z.literal('MULTI'),
    stem: z.string().min(5).max(1000),
    options: z.array(answerOptionSchema).min(3).max(8),
    correctOptionIds: z.array(z.string().min(1).max(20)).min(1),
    /** Si es true, marcar de mas descuenta; si no, se exige el conjunto exacto. */
    partialCredit: z.boolean().default(false),
    points: z.number().min(0.1).max(100).default(1),
    explanation: z.string().max(1000).optional(),
  })
  .refine((q) => q.correctOptionIds.every((id) => q.options.some((o) => o.id === id)), {
    message: 'Todas las respuestas correctas deben existir entre las opciones',
    path: ['correctOptionIds'],
  })
  .refine((q) => q.correctOptionIds.length < q.options.length, {
    message: 'No pueden ser correctas todas las opciones',
    path: ['correctOptionIds'],
  });

const trueFalseQuestionSchema = z.object({
  qtype: z.literal('TRUE_FALSE'),
  stem: z.string().min(5).max(1000),
  correctValue: z.boolean(),
  points: z.number().min(0.1).max(100).default(1),
  explanation: z.string().max(1000).optional(),
});

const essayQuestionSchema = z.object({
  qtype: z.literal('ESSAY'),
  stem: z.string().min(5).max(1000),
  /** Guia para quien califica manualmente. */
  rubric: z.string().max(2000).optional(),
  points: z.number().min(0.1).max(100).default(1),
});

/** Contenido completo de una version de pregunta. */
export const questionPayloadSchema = z.union([
  singleQuestionSchema,
  multiQuestionSchema,
  trueFalseQuestionSchema,
  essayQuestionSchema,
]);
export type QuestionPayload = z.infer<typeof questionPayloadSchema>;

export const createQuestionSchema = z.object({
  categoryId: z.string().uuid(),
  payload: questionPayloadSchema,
});
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

/** Editar una pregunta NO la modifica: crea una version nueva. */
export const reviseQuestionSchema = z.object({
  payload: questionPayloadSchema,
});

export const createQuestionCategorySchema = z.object({
  name: z.string().min(2).max(120),
  parentId: z.string().uuid().nullable().optional(),
});

export const listQuestionsQuerySchema = z.object({
  categoryId: z.string().uuid().optional(),
  q: z.string().max(200).optional(),
  qtype: questionTypeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ─────────────────────────── Evaluaciones ───────────────────────────

export const gradingPolicySchema = z.enum(['HIGHEST', 'LAST', 'FIRST', 'AVERAGE']);

/** Que puede ver el aprendiz despues de un intento (critico si el banco se reutiliza). */
export const reviewPolicySchema = z
  .object({
    showScore: z.boolean().default(true),
    showCorrectAnswers: z.boolean().default(false),
    showExplanations: z.boolean().default(true),
    onlyAfterLastAttempt: z.boolean().default(true),
  })
  .strict()
  .default({});

export const createAssessmentSchema = z.object({
  title: z.string().min(3).max(200),
});

/** Seccion FIJA (preguntas elegidas a mano) o ALEATORIA (N al azar de una categoria). */
export const assessmentSectionSchema = z.union([
  z.object({
    mode: z.literal('FIXED'),
    questionIds: z.array(z.string().uuid()).min(1).max(100),
  }),
  z.object({
    mode: z.literal('RANDOM_FROM_POOL'),
    categoryId: z.string().uuid(),
    pickCount: z.number().int().min(1).max(50),
  }),
]);
export type AssessmentSectionInput = z.infer<typeof assessmentSectionSchema>;

export const updateAssessmentDraftSchema = z.object({
  timeLimitMin: z.number().int().min(1).max(600).nullable().optional(),
  maxAttempts: z.number().int().min(1).max(10).nullable().optional(),
  passingScore: z.number().int().min(1).max(100).nullable().optional(),
  gradingPolicy: gradingPolicySchema.optional(),
  shuffleQuestions: z.boolean().optional(),
  shuffleOptions: z.boolean().optional(),
  reviewPolicy: reviewPolicySchema.optional(),
  sections: z.array(assessmentSectionSchema).min(1).max(20).optional(),
});
export type UpdateAssessmentDraftInput = z.infer<typeof updateAssessmentDraftSchema>;

export const publishAssessmentSchema = z.object({ confirm: z.literal(true) });
