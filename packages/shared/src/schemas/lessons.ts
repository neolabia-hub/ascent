import { z } from 'zod';

/**
 * Contratos de las LECCIONES EN TARJETAS (unidad de contenido de NEO PULSE, Decision #20).
 * Una leccion es una pila de 5-15 tarjetas de menos de 5 minutos. Cada tipo de tarjeta tiene
 * su propio payload: se modela como union discriminada para que la validacion sea exacta y la
 * UI pueda renderizar sin adivinar.
 *
 * Bloques de Fase 1 (skill pulse-ui): TEXT_IMAGE, VIDEO_SHORT, QUIZ, FLIP, POLL, FILL_GAP.
 * Fase 2 agregara HOTSPOT y MATCH sin romper este contrato (union abierta por `cardType`).
 */

/** Tope duro de video por tarjeta: la evidencia dice que el engagement se agota a los 6 min. */
export const MAX_CARD_VIDEO_SECONDS = 180;
export const VIDEO_WARNING_SECONDS = 90;

const optionSchema = z.object({
  id: z.string().min(1).max(20),
  text: z.string().min(1).max(300),
});

export const textImageCardSchema = z.object({
  cardType: z.literal('TEXT_IMAGE'),
  title: z.string().max(120).optional(),
  body: z.string().min(1).max(1200),
  mediaKey: z.string().max(300).nullable().optional(),
  caption: z.string().max(200).optional(),
});

export const videoShortCardSchema = z
  .object({
    cardType: z.literal('VIDEO_SHORT'),
    title: z.string().max(120).optional(),
    mediaKey: z.string().max(300).nullable().optional(),
    externalUrl: z.string().url().max(500).nullable().optional(),
    durationSeconds: z.number().int().min(1).max(MAX_CARD_VIDEO_SECONDS).optional(),
  })
  .refine((c) => Boolean(c.mediaKey) || Boolean(c.externalUrl), {
    message: 'La tarjeta de video necesita un archivo subido o una URL externa',
  });

export const quizCardSchema = z
  .object({
    cardType: z.literal('QUIZ'),
    question: z.string().min(3).max(400),
    options: z.array(optionSchema).min(2).max(5),
    correctOptionId: z.string().min(1).max(20),
    feedbackCorrect: z.string().max(300).optional(),
    feedbackWrong: z.string().max(300).optional(),
  })
  .refine((c) => c.options.some((o) => o.id === c.correctOptionId), {
    message: 'La respuesta correcta debe ser una de las opciones',
    path: ['correctOptionId'],
  });

export const flipCardSchema = z.object({
  cardType: z.literal('FLIP'),
  front: z.string().min(1).max(300),
  back: z.string().min(1).max(600),
});

export const pollCardSchema = z.object({
  cardType: z.literal('POLL'),
  question: z.string().min(3).max(400),
  options: z.array(optionSchema).min(2).max(6),
});

export const fillGapCardSchema = z
  .object({
    cardType: z.literal('FILL_GAP'),
    /** Frase con uno o mas huecos marcados con tres guiones bajos: "El EPP se usa ___". */
    sentence: z.string().min(5).max(400),
    /** Respuestas en el orden de aparicion de los huecos. */
    answers: z.array(z.string().min(1).max(60)).min(1).max(5),
    /** Palabras senuelo que se mezclan con las respuestas al arrastrar. */
    distractors: z.array(z.string().min(1).max(60)).max(6).default([]),
  })
  .refine((c) => (c.sentence.match(/___/g) ?? []).length === c.answers.length, {
    message: 'Debe haber una respuesta por cada hueco (___) de la frase',
    path: ['answers'],
  });

/**
 * Union de todos los tipos de tarjeta. Es `z.union` y no `z.discriminatedUnion` porque los
 * tipos con validacion cruzada (.refine) dejan de ser ZodObject puros y el discriminador no
 * los acepta. El campo `cardType` sigue siendo el discriminante en tiempo de ejecucion.
 */
export const anyCardSchema = z.union([
  textImageCardSchema,
  videoShortCardSchema,
  quizCardSchema,
  flipCardSchema,
  pollCardSchema,
  fillGapCardSchema,
]);
export type CardPayload = z.infer<typeof anyCardSchema>;

export const cardTypeSchema = z.enum(['TEXT_IMAGE', 'VIDEO_SHORT', 'QUIZ', 'FLIP', 'POLL', 'FILL_GAP']);
export type CardType = z.infer<typeof cardTypeSchema>;

export const createLessonSchema = z.object({
  title: z.string().min(3).max(200),
  estimatedMinutes: z.number().int().min(1).max(60).nullable().optional(),
});
export type CreateLessonInput = z.infer<typeof createLessonSchema>;

export const updateLessonSchema = createLessonSchema.partial();

/** Guardado completo de la pila de tarjetas (el editor manda la leccion entera). */
export const saveCardsSchema = z.object({
  cards: z
    .array(
      z.object({
        /** Id existente para conservar la tarjeta; ausente = tarjeta nueva. */
        id: z.string().uuid().optional(),
        payload: anyCardSchema,
      }),
    )
    .min(1, 'La leccion necesita al menos una tarjeta')
    .max(30, 'Maximo 30 tarjetas por leccion'),
});
export type SaveCardsInput = z.infer<typeof saveCardsSchema>;
