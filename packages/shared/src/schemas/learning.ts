import { z } from 'zod';

/**
 * Contratos del LADO DEL APRENDIZ (CLAUDE.md 1, "usuario final"; 3.4-3.6).
 *
 * Todo lo que entra por aqui lo envia un telefono, muchas veces con senal intermitente y a veces
 * repetido al reconectar. Por eso los contratos son ACUMULATIVOS y tolerantes a repeticion:
 * mandar dos veces el mismo progreso no puede dar un resultado distinto que mandarlo una vez.
 */

/** Telemetria de una pieza de contenido (tarjeta vista, video avanzado, documento leido). */
export const progressSchema = z.object({
  /** Porcentaje alcanzado. El servidor se queda con el MAYOR: el avance no retrocede. */
  pct: z.number().int().min(0).max(100),
  /** Segundos vistos en ESTA sesion; el servidor los acumula. */
  secondsSpent: z.number().int().min(0).max(86400).default(0),
  /** Ultima tarjeta vista, para retomar donde se quedo. */
  lastCardIndex: z.number().int().min(0).max(100).optional(),
});
export type ProgressInput = z.infer<typeof progressSchema>;

/** Respuesta a una pregunta. La forma depende del tipo; el servidor valida contra lo servido. */
export const answerSchema = z
  .object({
    optionId: z.string().min(1).max(20).optional(),
    optionIds: z.array(z.string().min(1).max(20)).max(8).optional(),
    value: z.boolean().optional(),
    text: z.string().max(5000).optional(),
  })
  .strict();
export type AnswerInput = z.infer<typeof answerSchema>;

export const saveAnswerSchema = z.object({
  attemptQuestionId: z.string().uuid(),
  answer: answerSchema,
});
export type SaveAnswerInput = z.infer<typeof saveAnswerSchema>;

/**
 * Entrega del examen. Puede traer todas las respuestas de una vez: es el caso del telefono que
 * estuvo sin senal y sincroniza al final.
 */
export const submitAttemptSchema = z.object({
  answers: z.array(saveAnswerSchema).max(200).default([]),
});
export type SubmitAttemptInput = z.infer<typeof submitAttemptSchema>;

/** Una respuesta de la sesion de repaso diaria. */
export const reviewAnswerSchema = z.object({
  questionVersionId: z.string().uuid(),
  answer: answerSchema,
});
export type ReviewAnswerInput = z.infer<typeof reviewAnswerSchema>;

export const submitReviewSchema = z.object({
  answers: z.array(reviewAnswerSchema).min(1).max(20),
});
export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;

/** Autoinscripcion en una convocatoria permanente (autoservicio). */
export const selfEnrollSchema = z.object({
  offeringId: z.string().uuid(),
});
export type SelfEnrollInput = z.infer<typeof selfEnrollSchema>;

export const listMyWorkQuerySchema = z.object({
  /** `pending` = lo que debo; `done` = mi historial. */
  scope: z.enum(['pending', 'done']).default('pending'),
});
export type ListMyWorkQuery = z.infer<typeof listMyWorkQuerySchema>;
