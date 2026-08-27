import { z } from 'zod';
import { modalitySchema } from './activities.js';

/**
 * Contratos de CONVOCATORIA (CLAUDE.md seccion 2, capa 3; negocio 3.7).
 *
 *   VERSION PUBLICADA (que se aprende)  ->  CONVOCATORIA (cuando, donde, con quien)
 *
 * Una convocatoria SIEMPRE cuelga de una version PUBLICADA: no se puede convocar un borrador,
 * porque el contenido que veria la gente aun podria cambiar (Decision #6).
 *
 * Tres formas, y la forma decide que datos son obligatorios:
 *   EVENT     sesion con fecha (presencial o virtual sincronica): exige fecha e intensidad.
 *   PERMANENT autoservicio permanente: sin fecha; ventana opcional de vigencia.
 *   HYBRID    sesion + parte virtual: exige ambas condiciones para dar por completada.
 */

export const offeringKindSchema = z.enum(['EVENT', 'PERMANENT', 'HYBRID']);
export const offeringStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']);
export const executedBySchema = z.enum(['PROPIOS', 'TEMPORALES', 'ARL', 'EPS', 'OTROS']);

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD');
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora HH:mm');

const offeringBaseSchema = z.object({
  activityVersionId: z.string().uuid(),
  kind: offeringKindSchema,
  modality: modalitySchema,

  scheduledDate: dateOnly.nullable().optional(),
  startTime: timeOfDay.nullable().optional(),
  endTime: timeOfDay.nullable().optional(),
  windowStart: dateOnly.nullable().optional(),
  windowEnd: dateOnly.nullable().optional(),

  // Desglose SIEMPRE separado (Decision #30): PESV Paso 10 lo exige y BPM suma 10 h/ano.
  intensityTheoryHours: z.number().min(0).max(999).nullable().optional(),
  intensityPracticeHours: z.number().min(0).max(999).nullable().optional(),

  instructorUserId: z.string().uuid().nullable().optional(),
  instructorExternalName: z.string().min(3).max(160).nullable().optional(),
  instructorCredentialKey: z.string().max(400).nullable().optional(),
  executedBy: executedBySchema.default('PROPIOS'),
  executedByOther: z.string().min(2).max(160).nullable().optional(),

  location: z.string().max(200).nullable().optional(),
  regionalId: z.string().uuid().nullable().optional(),
  capacity: z.number().int().min(1).max(10000).nullable().optional(),
  observations: z.string().max(4000).nullable().optional(),
});

/**
 * Reglas por forma y coherencia de fechas. Se validan en el CONTRATO (no en la pantalla) para
 * que la API sea igual de estricta que la UI: una convocatoria presencial sin fecha no es una
 * convocatoria, es una intencion.
 */
type OfferingFields = Omit<z.infer<typeof offeringBaseSchema>, 'activityVersionId'>;

function checkOffering(value: OfferingFields, ctx: z.RefinementCtx): void {
  {
    const needsDate = value.kind === 'EVENT' || value.kind === 'HYBRID';
    if (needsDate && !value.scheduledDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scheduledDate'], message: 'La sesion necesita fecha.' });
    }
    if (value.kind === 'PERMANENT' && value.scheduledDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scheduledDate'],
        message: 'Una convocatoria permanente no lleva fecha de sesion.',
      });
    }
    if (value.startTime && value.endTime && value.startTime >= value.endTime) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endTime'], message: 'La hora de fin debe ser posterior.' });
    }
    if (value.windowStart && value.windowEnd && value.windowStart > value.windowEnd) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['windowEnd'], message: 'El cierre debe ser posterior.' });
    }
    if (value.executedBy === 'OTROS' && !value.executedByOther) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['executedByOther'], message: 'Indica quien la ejecuta.' });
    }
    if (value.modality !== 'VIRTUAL' && value.kind !== 'PERMANENT' && !value.location) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['location'], message: 'Indica el lugar de la sesion.' });
    }
  }
}

export const createOfferingSchema = offeringBaseSchema.superRefine(checkOffering);
export type CreateOfferingInput = z.infer<typeof createOfferingSchema>;

/** Editar una convocatoria en borrador. La version formativa NO se cambia: se crea otra. */
export const updateOfferingSchema = offeringBaseSchema.omit({ activityVersionId: true }).superRefine(checkOffering);
export type UpdateOfferingInput = z.infer<typeof updateOfferingSchema>;

export const listOfferingsQuerySchema = z.object({
  q: z.string().max(200).optional(),
  status: offeringStatusSchema.optional(),
  kind: offeringKindSchema.optional(),
  activityId: z.string().uuid().optional(),
  processId: z.string().uuid().optional(),
  regionalId: z.string().uuid().optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListOfferingsQuery = z.infer<typeof listOfferingsQuerySchema>;

/**
 * Publicar CONGELA los proyectados (Decision #5): el indicador de cobertura debe ser dato, no
 * opinion. `projectedOverride` permite corregir el numero derivado, pero SOLO con justificacion,
 * que queda auditada y visible en la convocatoria.
 */
export const publishOfferingSchema = z
  .object({
    projectedOverride: z.number().int().min(0).max(100000).optional(),
    projectedAdjustReason: z.string().min(10).max(500).optional(),
    justification: z.string().min(10).max(500).optional(),
    confirm: z.literal(true),
  })
  .superRefine((value, ctx) => {
    if (value.projectedOverride !== undefined && !value.projectedAdjustReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['projectedAdjustReason'],
        message: 'Ajustar los proyectados exige justificacion.',
      });
    }
  });
export type PublishOfferingInput = z.infer<typeof publishOfferingSchema>;

export const cancelOfferingSchema = z.object({
  cancelledReason: z.string().min(10).max(500),
});
export type CancelOfferingInput = z.infer<typeof cancelOfferingSchema>;

/**
 * Inscribir (crear la EJECUCION) a los obligados o a personas puntuales. Asignacion e
 * inscripcion NO se fusionan (Decision #2): la inscripcion nace enlazada a la obligacion que
 * satisface, y la obligacion sigue existiendo hasta que la ejecucion la cumple.
 */
export const enrollOfferingSchema = z
  .object({
    /** true = inscribe a todos los que tienen la obligacion pendiente de esta actividad. */
    allAssigned: z.boolean().default(false),
    userIds: z.array(z.string().uuid()).max(2000).default([]),
  })
  .superRefine((value, ctx) => {
    if (!value.allAssigned && value.userIds.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['userIds'], message: 'Elige a quien inscribir.' });
    }
  });
export type EnrollOfferingInput = z.infer<typeof enrollOfferingSchema>;
