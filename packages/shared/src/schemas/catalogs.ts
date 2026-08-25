import { z } from 'zod';

/**
 * Contratos de los catalogos parametrizables por tenant (CLAUDE.md 3.2).
 * Zod es la fuente unica: la API valida el body con estos schemas y la UI los reutiliza.
 */

const codeSchema = z
  .string()
  .min(2)
  .max(40)
  .regex(/^[A-Z0-9_]+$/, 'Solo mayusculas, numeros y guion bajo');

const nameSchema = z.string().min(2).max(120);

/** Base comun de todo catalogo simple. */
export const catalogBaseSchema = z.object({
  code: codeSchema,
  name: nameSchema,
  active: z.boolean().default(true),
  displayOrder: z.number().int().min(0).max(9999).default(0),
});

export const areaSchema = catalogBaseSchema.extend({
  parentId: z.string().uuid().nullable().optional(),
  managerUserId: z.string().uuid().nullable().optional(),
});

export const processSchema = catalogBaseSchema.extend({
  responsibleUserId: z.string().uuid().nullable().optional(),
  areaId: z.string().uuid().nullable().optional(),
});

export const jobTitleTypeSchema = catalogBaseSchema;

export const jobTitleSchema = catalogBaseSchema.extend({
  jobTitleTypeId: z.string().uuid(),
});

export const serviceSchema = catalogBaseSchema;
export const regionalSchema = catalogBaseSchema;

export const normSchema = catalogBaseSchema.extend({
  annualHoursRequired: z.number().int().min(1).max(200).nullable().optional(),
});

/** Config de comportamiento de un tipo de actividad (Decision #8). */
export const activityTypeConfigSchema = z
  .object({
    requiresAssessment: z.boolean().default(true),
    requiresSurvey: z.boolean().default(false),
    requiresEfficacy: z.boolean().default(false),
    issuesCertificate: z.boolean().default(true),
    requiresBeforeHire: z.boolean().default(false),
    defaultAssignmentMode: z.enum(['ON_HIRE', 'BY_JOB_TITLE', 'MANUAL']).default('MANUAL'),
    defaultRecurrenceMonths: z.number().int().min(1).max(120).nullable().default(null),
    participatesInPlan: z.boolean().default(false),
    isMicro: z.boolean().default(false),
  })
  .strict();

export type ActivityTypeConfig = z.infer<typeof activityTypeConfigSchema>;

export const activityTypeSchema = catalogBaseSchema.extend({
  icon: z.string().max(40).nullable().optional(),
  colorHex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  config: activityTypeConfigSchema.default({}),
});

// Para actualizaciones: todos los campos opcionales (el code NO se cambia una vez creado:
// los snapshots historicos y los seeds referencian por code).
export const areaUpdateSchema = areaSchema.omit({ code: true }).partial();
export const processUpdateSchema = processSchema.omit({ code: true }).partial();
export const jobTitleTypeUpdateSchema = jobTitleTypeSchema.omit({ code: true }).partial();
export const jobTitleUpdateSchema = jobTitleSchema.omit({ code: true }).partial();
export const serviceUpdateSchema = serviceSchema.omit({ code: true }).partial();
export const regionalUpdateSchema = regionalSchema.omit({ code: true }).partial();
export const normUpdateSchema = normSchema.omit({ code: true }).partial();
export const activityTypeUpdateSchema = activityTypeSchema.omit({ code: true }).partial();

export type AreaInput = z.infer<typeof areaSchema>;
export type ProcessInput = z.infer<typeof processSchema>;
export type JobTitleInput = z.infer<typeof jobTitleSchema>;
export type NormInput = z.infer<typeof normSchema>;
export type ActivityTypeInput = z.infer<typeof activityTypeSchema>;
