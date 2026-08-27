import { z } from 'zod';
import { employmentTypeSchema, roadActorSchema } from './users.js';

/**
 * Contratos de OBLIGACION (CLAUDE.md seccion 2, capa 4; negocio 6.6).
 *
 *   AUDIENCIA (a quienes aplica)  ->  REQUISITO (que se les exige y cuando)  ->  ASIGNACION
 *
 * La ASIGNACION existe sin participacion: "obligado sin inscribir" es el estado que mide el
 * cumplimiento (Decision #2). Nunca se borra: se retira con motivo (Decision #11).
 */

// ─────────────────────────── Audiencia ───────────────────────────

/**
 * Regla de audiencia: una lista por FACETA (cargo, tipo de cargo, area, regional, vinculacion,
 * actor vial). Cada faceta con elementos es una condicion "el atributo de la persona esta en la
 * lista"; las facetas vacias no condicionan.
 *
 *   match = ALL  -> deben cumplirse TODAS las facetas con contenido (interseccion).
 *   match = ANY  -> basta con UNA (union).
 *
 * Una regla sin ninguna faceta es "toda la empresa", y se dice asi en la pantalla para que nadie
 * la cree por accidente.
 */
export const audienceRuleSchema = z
  .object({
    match: z.enum(['ALL', 'ANY']).default('ALL'),
    jobTitleIds: z.array(z.string().uuid()).max(300).default([]),
    jobTitleTypeIds: z.array(z.string().uuid()).max(50).default([]),
    areaIds: z.array(z.string().uuid()).max(200).default([]),
    regionalIds: z.array(z.string().uuid()).max(100).default([]),
    employmentTypes: z.array(employmentTypeSchema).max(4).default([]),
    roadActors: z.array(roadActorSchema).max(5).default([]),
  })
  .strict();
export type AudienceRule = z.infer<typeof audienceRuleSchema>;

export const createAudienceSchema = z.object({
  name: z.string().min(3).max(160),
  rule: audienceRuleSchema,
  /** Dinamica: el sistema la recalcula cuando alguien entra, sale o cambia de cargo. */
  isDynamic: z.boolean().default(true),
});
export type CreateAudienceInput = z.infer<typeof createAudienceSchema>;

export const updateAudienceSchema = createAudienceSchema.partial().extend({
  active: z.boolean().optional(),
});
export type UpdateAudienceInput = z.infer<typeof updateAudienceSchema>;

// ─────────────────────────── Requisito (regla de asignacion) ───────────────────────────

export const assignmentTargetTypeSchema = z.enum(['ACTIVITY', 'PATH', 'CERTIFICATION']);
export const ruleTriggerSchema = z.enum(['ON_JOIN', 'ON_HIRE', 'SCHEDULED']);

/**
 * Recurrencia del requisito (Decision #12). Dos anclajes, ambos reales en la operacion:
 *   everyMonths -> "cada 12 meses desde que la persona la completo" (reinduccion, carne BPM).
 *   fixedDate   -> "todos los anos antes del 31 de enero" (capacitacion anual SARLAFT).
 * `windowDays` es con cuanta antelacion nace la ronda siguiente, para que aparezca en los
 * pendientes con tiempo y no el mismo dia del vencimiento.
 */
export const recurrenceSchema = z
  .object({
    everyMonths: z.number().int().min(1).max(120).optional(),
    fixedDate: z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Fecha MM-DD').optional(),
    windowDays: z.number().int().min(0).max(365).default(60),
  })
  .strict()
  .superRefine((value, ctx) => {
    const anchors = [value.everyMonths !== undefined, value.fixedDate !== undefined].filter(Boolean).length;
    if (anchors !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Elige un solo anclaje: cada N meses o una fecha fija anual.',
      });
    }
  });
export type Recurrence = z.infer<typeof recurrenceSchema>;

export const createAssignmentRuleSchema = z
  .object({
    audienceId: z.string().uuid(),
    targetType: assignmentTargetTypeSchema.default('ACTIVITY'),
    targetId: z.string().uuid(),
    trigger: ruleTriggerSchema,
    /**
     * Dias respecto al disparador. NEGATIVO = antes. En ON_HIRE debe ser <= 0 porque la
     * induccion es PREVIA al inicio de labores (D1072 art. 2.2.4.6.11).
     */
    dueDaysAfterTrigger: z.number().int().min(-365).max(3650).default(0),
    recurrence: recurrenceSchema.nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.trigger === 'ON_HIRE' && value.dueDaysAfterTrigger > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dueDaysAfterTrigger'],
        message: 'La induccion de ingreso vence ANTES de la fecha de ingreso (usa 0 o negativo).',
      });
    }
    if (value.trigger === 'SCHEDULED' && !value.recurrence) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recurrence'],
        message: 'Un requisito programado necesita su recurrencia.',
      });
    }
  });
export type CreateAssignmentRuleInput = z.infer<typeof createAssignmentRuleSchema>;

export const updateAssignmentRuleSchema = z.object({
  dueDaysAfterTrigger: z.number().int().min(-365).max(3650).optional(),
  recurrence: recurrenceSchema.nullable().optional(),
  active: z.boolean().optional(),
});
export type UpdateAssignmentRuleInput = z.infer<typeof updateAssignmentRuleSchema>;

/** Matriz cargo -> actividad: la forma corta de declarar las inducciones especificas. */
export const toggleJobTitleMatrixSchema = z.object({
  jobTitleId: z.string().uuid(),
  activityId: z.string().uuid(),
  enabled: z.boolean(),
  /** Solo al activar: dias respecto al ingreso (negativo = antes). */
  dueDaysAfterTrigger: z.number().int().min(-365).max(3650).default(0),
});
export type ToggleJobTitleMatrixInput = z.infer<typeof toggleJobTitleMatrixSchema>;

// ─────────────────────────── Asignacion individual ───────────────────────────

export const assignmentStatusSchema = z.enum([
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'OVERDUE',
  'WITHDRAWN_LEFT_AUDIENCE',
  'WAIVED',
]);

/** Asignacion manual: a personas, o a todo un cargo / area / regional (se expande a personas). */
export const createAssignmentSchema = z
  .object({
    targetType: assignmentTargetTypeSchema.default('ACTIVITY'),
    targetId: z.string().uuid(),
    userIds: z.array(z.string().uuid()).max(2000).default([]),
    jobTitleIds: z.array(z.string().uuid()).max(300).default([]),
    areaIds: z.array(z.string().uuid()).max(200).default([]),
    regionalIds: z.array(z.string().uuid()).max(100).default([]),
    dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD').nullable().optional(),
  })
  .superRefine((value, ctx) => {
    const total =
      value.userIds.length + value.jobTitleIds.length + value.areaIds.length + value.regionalIds.length;
    if (total === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['userIds'], message: 'Elige a quien asignar.' });
    }
  });
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;

/** Eximir de la obligacion. Exige motivo: queda en la evidencia y explica el indicador. */
export const waiveAssignmentSchema = z.object({
  waivedReason: z.string().min(10).max(500),
});
export type WaiveAssignmentInput = z.infer<typeof waiveAssignmentSchema>;

export const listAssignmentsQuerySchema = z.object({
  q: z.string().max(200).optional(),
  userId: z.string().uuid().optional(),
  targetId: z.string().uuid().optional(),
  status: assignmentStatusSchema.optional(),
  source: z.enum(['MANUAL', 'RULE', 'PLAN', 'STATIC_SNAPSHOT']).optional(),
  areaId: z.string().uuid().optional(),
  jobTitleId: z.string().uuid().optional(),
  overdueOnly: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListAssignmentsQuery = z.infer<typeof listAssignmentsQuerySchema>;
