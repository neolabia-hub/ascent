import { z } from 'zod';

/**
 * Contratos del PLAN DE CAPACITACION ANUAL (CLAUDE.md 3.10).
 *
 * El plan es una ENTIDAD EMPRESARIAL PROPIA (Decision #3): tiene objetivo, metas, aprobacion e
 * indicadores. Sus renglones REFERENCIAN convocatorias planificadas; el plan no posee la
 * actividad, de modo que reprogramar o partir una convocatoria en dos sedes no reescribe el plan.
 */

export const planStatusSchema = z.enum(['DRAFT', 'APPROVED', 'ACTIVE', 'CLOSED']);
export const planItemStatusSchema = z.enum(['PLANNED', 'EXECUTED', 'RESCHEDULED', 'CANCELLED']);

export const createTrainingPlanSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  name: z.string().min(3).max(160),
  objective: z.string().max(4000).nullable().optional(),
  goals: z.string().max(4000).nullable().optional(),
  scope: z.string().max(4000).nullable().optional(),
});
export type CreateTrainingPlanInput = z.infer<typeof createTrainingPlanSchema>;

export const updateTrainingPlanSchema = createTrainingPlanSchema.omit({ year: true }).partial();
export type UpdateTrainingPlanInput = z.infer<typeof updateTrainingPlanSchema>;

export const addPlanItemSchema = z.object({
  offeringId: z.string().uuid(),
  plannedMonth: z.number().int().min(1).max(12),
  notes: z.string().max(2000).nullable().optional(),
});
export type AddPlanItemInput = z.infer<typeof addPlanItemSchema>;

export const updatePlanItemSchema = z.object({
  /** Cambiar el mes es REPROGRAMAR: queda auditado y el renglon pasa a RESCHEDULED. */
  plannedMonth: z.number().int().min(1).max(12).optional(),
  notes: z.string().max(2000).nullable().optional(),
  /** Solo cancelacion manual; EXECUTED lo pone el sistema al cerrar la convocatoria. */
  status: z.enum(['PLANNED', 'CANCELLED']).optional(),
});
export type UpdatePlanItemInput = z.infer<typeof updatePlanItemSchema>;

/**
 * Aprobar CONGELA los proyectados de cada renglon y genera las obligaciones del plan
 * (source = PLAN). Es lo que hace que las metricas del plan sean estables: a partir de aqui
 * nada de lo que ocurra fuera del plan las mueve (regla de oro 2).
 */
export const approvePlanSchema = z.object({
  confirm: z.literal(true),
  justification: z.string().min(10).max(500).optional(),
});
export type ApprovePlanInput = z.infer<typeof approvePlanSchema>;

export const listPlansQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  status: planStatusSchema.optional(),
});
export type ListPlansQuery = z.infer<typeof listPlansQuerySchema>;
