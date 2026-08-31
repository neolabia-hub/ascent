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
  /**
   * LA META, en porcentaje: cuanto del programa se compromete la empresa a ejecutar este ano.
   *
   * Era `goals`, texto libre, y por eso el plan ensenaba "62% de cumplimiento" sin nada contra
   * que compararlo. Se mide contra el CUMPLIMIENTO (ejecutadas / programadas), que es el indicador
   * que revisa el item 1.2.1 de la Res. 0312.
   */
  goalPct: z.number().int().min(1).max(100).nullable().optional(),
  scope: z.string().max(4000).nullable().optional(),
});
export type CreateTrainingPlanInput = z.infer<typeof createTrainingPlanSchema>;

/**
 * Editar la CABECERA del plan: nombre, objetivo, metas y alcance.
 *
 * Se puede con el plan YA APROBADO, con motivo. Son texto descriptivo —lo que obliga a la gente
 * son los renglones, no el objetivo redactado en enero—, asi que congelarlos no protegia ninguna
 * obligacion: solo obligaba a convivir todo el ano con un nombre mal escrito.
 *
 * El ANO si es estructural: identifica el plan junto al nombre y ancla el vencimiento de cada
 * renglon al ultimo dia de su mes. Por eso solo se cambia en borrador.
 */
export const updateTrainingPlanSchema = createTrainingPlanSchema.partial().extend({
  /** OBLIGATORIA si el plan ya esta aprobado o en ejecucion. En borrador seria ruido. */
  justification: z.string().min(10).max(500).optional(),
});
export type UpdateTrainingPlanInput = z.infer<typeof updateTrainingPlanSchema>;

/**
 * BORRAR el plan. Que se puede borrar y que no lo decide `plans/plan-deletion.ts` en el
 * servidor: la frontera no es el estado del plan, es si alguien EMPEZO.
 *
 * `confirm` explicito porque puede revocar de una vez las obligaciones de mucha gente; la
 * pantalla dice cuantas antes de pulsar.
 */
export const deletePlanSchema = z.object({
  confirm: z.literal(true),
  justification: z.string().min(10).max(500).optional(),
});
export type DeletePlanInput = z.infer<typeof deletePlanSchema>;

export const addPlanItemSchema = z.object({
  offeringId: z.string().uuid(),
  plannedMonth: z.number().int().min(1).max(12),
  notes: z.string().max(2000).nullable().optional(),
  /**
   * OBLIGATORIA si el plan ya esta aprobado o en ejecucion (Decision #55).
   *
   * En borrador no se pide: el plan todavia no obliga a nadie y pedir un motivo por cada renglon
   * mientras se arma el ano seria ruido. Despues de aprobado si, porque agregar una jornada crea
   * obligaciones reales para personas reales y el auditor va a preguntar de donde salio.
   */
  justification: z.string().min(10).max(500).optional(),
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

/**
 * REABRIR un plan CERRADO. Exige motivo, siempre.
 *
 * Cerrar es lo que convierte al plan en la evidencia del ano, asi que reabrirlo no puede ser un
 * clic mas: el auditor tiene derecho a saber por que un ano que estaba cerrado volvio a moverse.
 * Pero tampoco puede ser imposible — desde que hay un plan por ano (Decision #71), un plan cerrado
 * por error bloquea el ano entero y no queda forma de planear.
 *
 * Reabrir deja rastro; borrar no. Por eso esta es la salida para un plan que SI obligo a gente, y
 * borrar se reserva al que nunca obligo a nadie.
 */
export const reopenPlanSchema = z.object({
  confirm: z.literal(true),
  justification: z.string().min(10).max(500),
});
export type ReopenPlanInput = z.infer<typeof reopenPlanSchema>;

export const listPlansQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  status: planStatusSchema.optional(),
});
export type ListPlansQuery = z.infer<typeof listPlansQuerySchema>;
