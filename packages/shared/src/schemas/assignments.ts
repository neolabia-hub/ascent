import { z } from 'zod';
import { employmentTypeSchema, roadActorSchema } from './users.js';
import { fixedDateSchema } from './fixed-date.js';

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
    /** Linea de servicio. Solo alcanza a quien la tenga puesta: no es obligatoria en la persona. */
    serviceIds: z.array(z.string().uuid()).max(50).default([]),
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
export const ruleTriggerSchema = z.enum(['ON_JOIN', 'ON_HIRE', 'SCHEDULED', 'PLAN']);

/**
 * Recurrencia del requisito (Decision #12). Dos anclajes, ambos reales en la operacion:
 *   everyMonths -> "cada 12 meses desde que la persona la completo" (reinduccion, carne BPM).
 *   fixedDate   -> "todos los años antes del 31 de enero" (capacitacion anual SARLAFT).
 * `windowDays` es con cuanta antelacion nace la ronda siguiente, para que aparezca en los
 * pendientes con tiempo y no el mismo dia del vencimiento.
 */
/**
 * QUE PASA CUANDO LLEGA LA RONDA SIGUIENTE Y LA ANTERIOR NO SE HIZO.
 *
 * Tres formas, porque las empresas no lo resuelven igual y esto no se puede cablear:
 *
 *   CIERRA     la anterior se cierra como NO REALIZADA —queda en el historial como incumplimiento
 *              de ese periodo— y la nueva nace para todos. Una sola obligacion viva a la vez. Es
 *              como funciona el cumplimiento por CALENDARIO: cada campaña es su periodo, y el
 *              periodo cierra. Es lo que pregunta el auditor, año por año.
 *   ACUMULA    la anterior sigue pendiente Y nace la nueva: la persona debe las dos. Para quien
 *              exige ponerse al dia antes de seguir. A los tres años debe tres.
 *   ESPERA     no nace la siguiente hasta que haga la anterior. Era lo unico que habia, y tiene un
 *              efecto que casi nadie quiere: quien nunca la hace desaparece del denominador de los
 *              años siguientes, asi que el peor incumplidor sale de la cuenta y la cobertura se ve
 *              mejor de lo que es.
 */
export const onExpirySchema = z.enum(['CIERRA', 'ACUMULA', 'ESPERA']);
export type OnExpiry = z.infer<typeof onExpirySchema>;

export const recurrenceSchema = z
  .object({
    everyMonths: z.number().int().min(1).max(120).optional(),
    fixedDate: fixedDateSchema.optional(),
    windowDays: z.number().int().min(0).max(365).default(60),
    /**
     * Por defecto ESPERA para no cambiarle el comportamiento a lo que ya existe. Los tipos que son
     * campaña anual lo traen puesto en `defaultOnExpiry` y llega aqui al crear el requisito.
     */
    onExpiry: onExpirySchema.default('ESPERA'),
    /**
     * No se le exige a quien ingreso hace menos de N meses. Viaja con la recurrencia —igual que
     * `onExpiry`— porque es donde el motor la lee, pero la decide el TIPO
     * (`exemptRecentHiresMonths`). `0` = no se excluye a nadie.
     */
    exemptRecentHiresMonths: z.number().int().min(0).max(24).default(0),
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

/**
 * EXIGIR UNA FORMACION, dicho desde la formacion misma.
 *
 * Es el mismo requisito de siempre —audiencia + regla— pero en UNA sola operacion, porque la
 * secuencia anterior (ir a Asignaciones, crear una audiencia con nombre, volver, crear el
 * requisito eligiendola de una lista) obliga al analista a aprenderse un vocabulario que no es
 * suyo para decir algo tan simple como "esto lo hacen los conductores".
 *
 * La AUDIENCIA se busca o se crea sola a partir del alcance, y se reconoce por su FORMA, igual
 * que hace la matriz por cargo: asi, exigir algo "a los conductores" desde aqui y marcarlo en la
 * matriz son la misma fila, y no dos audiencias gemelas que despues nadie sabe cual mirar.
 */
export const setActivityRequirementSchema = z
  .object({
    activityId: z.string().uuid(),
    /** Sin ninguna faceta = toda la empresa. La pantalla lo dice con esas palabras. */
    scope: audienceRuleSchema,
    /**
     * ON_HIRE ancla en la fecha de ingreso (la induccion previa que exige D1072); ON_JOIN, en el
     * momento en que se le empieza a exigir. SCHEDULED no se ofrece aqui: "cada N meses" se pide
     * como recurrencia, que es como lo dice el negocio.
     *
     * PLAN es distinto de los tres: no dispara NADA. Lo pone el servidor cuando la formacion es
     * del plan, y significa "esta regla guarda a quienes, y las obligaciones las crea el plan al
     * aprobar el renglon" (Decision #76). El cliente no lo elige: se lo encuentra puesto.
     */
    trigger: z.enum(['ON_HIRE', 'ON_JOIN', 'PLAN']),
    dueDaysAfterTrigger: z.number().int().min(-365).max(3650).default(0),
    /** "Se repite cada N meses" (reinduccion). Null = una sola vez. */
    everyMonths: z.number().int().min(1).max(120).nullable().default(null),
    /**
     * "Cada año antes del 31 de marzo" (MM-DD). Alternativa a `everyMonths`, y la forma en que las
     * empresas hacen de verdad la reinduccion: una CAMPANA anual, no un aniversario por persona.
     *
     * La diferencia importa al arrancar el sistema: con "cada 12 meses" la fecha de todos queda
     * pegada al dia en que se subieron los usuarios —el mismo para 116 personas, que no es real—;
     * con fecha fija, todos vencen el 31 de marzo, que es lo que el auditor pregunta ("¿hicieron
     * la reinduccion 2026?").
     */
    fixedDate: fixedDateSchema.nullable().default(null),
    /**
     * A QUIEN ALCANZA: `true` = solo a quien entre a la audiencia desde ahora; `false` (por
     * defecto) = tambien a los que ya estan.
     *
     * Existe por la puesta en marcha. Al subir la plantilla, las inducciones que esa gente ya
     * hizo en papel no pueden aparecerle como pendientes: eximir 116 veces no es una salida, y
     * marcarlas cumplidas es mentir en el registro que despues mira el auditor.
     */
    soloNuevos: z.boolean().default(false),
    /**
     * La NOVEDAD: por que se cambia a quien se le exige.
     *
     * La pide la induccion especifica, donde el alcance lo dicta la matriz de cargos y apartarse
     * de ella es una decision que alguien tendra que explicar en una auditoria. Queda en el
     * registro junto al cambio.
     */
    reason: z.string().min(10).max(500).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.trigger === 'ON_HIRE' && value.dueDaysAfterTrigger > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dueDaysAfterTrigger'],
        message: 'La induccion de ingreso vence ANTES de la fecha de ingreso (usa 0 o negativo).',
      });
    }
  });
export type SetActivityRequirementInput = z.infer<typeof setActivityRequirementSchema>;

/**
 * EXIGIR UN PROGRAMA COMPLETO, en un solo boton (2026-09-14, PENDIENTES 11.3).
 *
 * Es EXACTAMENTE `setActivityRequirementSchema` sin `activityId`: el programa no es un target
 * nuevo del motor de requisitos (`AssignmentTargetType.PATH` sigue sin usarse) — es azucar sobre
 * el mismo `setActivityRequirement`, aplicado UNA VEZ POR MODULO con el mismo alcance. Quien
 * asigna el programa no sabe que por debajo se crearon N requisitos, uno por formacion; ve una
 * sola operacion, igual que con una formacion suelta.
 */
export const assignProgramSchema = z
  .object({
    scope: audienceRuleSchema,
    trigger: z.enum(['ON_HIRE', 'ON_JOIN']),
    dueDaysAfterTrigger: z.number().int().min(-365).max(3650).default(0),
    everyMonths: z.number().int().min(1).max(120).nullable().default(null),
    fixedDate: fixedDateSchema.nullable().default(null),
    soloNuevos: z.boolean().default(false),
    reason: z.string().min(10).max(500).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.trigger === 'ON_HIRE' && value.dueDaysAfterTrigger > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dueDaysAfterTrigger'],
        message: 'La induccion de ingreso vence ANTES de la fecha de ingreso (usa 0 o negativo).',
      });
    }
  });
export type AssignProgramInput = z.infer<typeof assignProgramSchema>;

/** Matriz cargo -> actividad: la forma corta de declarar las inducciones especificas. */
export const toggleJobTitleMatrixSchema = z.object({
  jobTitleId: z.string().uuid(),
  activityId: z.string().uuid(),
  enabled: z.boolean(),
  /**
   * Solo al activar: dias respecto al ingreso. Por defecto **-1**, no 0: D1072 art. 2.2.4.6.11
   * exige que la induccion sea PREVIA al inicio de labores, y "el mismo dia" no es previa. Era 0,
   * asi que la misma casilla vencia distinto segun se creara aqui o en la ficha.
   */
  dueDaysAfterTrigger: z.number().int().min(-365).max(0).default(-1),
  /** La novedad, cuando se cambia una casilla que YA existia. La exige el servidor. */
  reason: z.string().min(10).max(500).nullable().optional(),
});
export type ToggleJobTitleMatrixInput = z.infer<typeof toggleJobTitleMatrixSchema>;

// ─────────────────────────── Asignacion individual ───────────────────────────

export const assignmentStatusSchema = z.enum([
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'OVERDUE',
  'WITHDRAWN_LEFT_AUDIENCE',
  /** El renglon del plan que la creo se cancelo. Ver `plans.service.updateItem`. */
  'WITHDRAWN_PLAN_ITEM_CANCELLED',
  'WAIVED',
  /**
   * Cerro el periodo y no la hizo. A diferencia de RETIRADA y EXIMIDA, esta **SI cuenta como
   * incumplimiento** de ese periodo: es lo que permite que una campaña anual pase de año sin
   * perder de vista a quien no la hizo. Ver `onExpirySchema`.
   */
  'EXPIRED_NOT_DONE',
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
    /** Linea de servicio. Solo alcanza a quien la tenga puesta: no es obligatoria en la persona. */
    serviceIds: z.array(z.string().uuid()).max(50).default([]),
    dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD').nullable().optional(),
  })
  .superRefine((value, ctx) => {
    const total =
      value.userIds.length +
      value.jobTitleIds.length +
      value.areaIds.length +
      value.regionalIds.length +
      value.serviceIds.length;
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
