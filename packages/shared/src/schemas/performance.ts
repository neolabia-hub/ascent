import { z } from 'zod';

/**
 * EVALUACION DE DESEMPENO (Decision #134). Ver `docs/modulos/desempeno.md`.
 *
 * Los contratos viven aqui y no en la API por la regla de siempre: una sola fuente para el
 * servidor y la pantalla. Si el minimo de un campo cambia en un sitio y no en el otro, el error
 * llega como un 422 que la pantalla no supo evitar.
 */

export const performanceScales = ['ONE_TO_FIVE', 'ONE_TO_TEN', 'YES_NO', 'TEXT_ONLY'] as const;
export type PerformanceScaleCode = (typeof performanceScales)[number];

/** Cuanto vale como maximo cada escala. Lo necesitan la pantalla y el calculo de la nota. */
export const TOPE_DE_ESCALA: Record<PerformanceScaleCode, number | null> = {
  ONE_TO_FIVE: 5,
  ONE_TO_TEN: 10,
  YES_NO: 1,
  TEXT_ONLY: null,
};

export const competencySchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(30)
    .regex(/^[A-Z0-9_-]+$/, 'Solo mayusculas, numeros, guion y guion bajo'),
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  scale: z.enum(performanceScales).default('ONE_TO_FIVE'),
  active: z.boolean().default(true),
  displayOrder: z.number().int().min(0).max(999).default(0),
  /** Que formacion fortalece esta competencia. Es la costura hacia el plan; hoy no la lee nadie. */
  suggestedActivityId: z.string().uuid().nullable().optional(),
});
export type CompetencyInput = z.infer<typeof competencySchema>;

export const competencyUpdateSchema = competencySchema.partial().omit({ code: true });

export const formSchema = z.object({
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  active: z.boolean().default(true),
  /**
   * Las competencias que se preguntan, EN ORDEN. Se manda la lista entera y no un parche: es lo
   * mismo que hace el constructor de examenes, y evita el baile de "anadi una y se me movio otra".
   */
  items: z
    .array(
      z.object({
        competencyId: z.string().uuid(),
        weight: z.number().int().min(1).max(10).default(1),
      }),
    )
    .min(1, 'Un formulario sin competencias no evalua nada'),
  /** Cargos a los que aplica. Vacio = a toda la empresa. */
  jobTitleIds: z.array(z.string().uuid()).default([]),
  /**
   * DE QUE FORMULARIO HEREDA LAS COMPETENCIAS COMUNES (Decision #141).
   *
   * `null` = no hereda de nadie. Las heredadas van PRIMERO en la copia congelada, y las de este
   * formulario despues: quien califica lee las de toda la empresa y luego las de su cargo.
   */
  baseFormId: z.string().uuid().nullable().default(null),
});
export type FormInput = z.infer<typeof formSchema>;

export const cycleSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    /**
     * LOS FORMULARIOS DE LA CAMPANA (Decision #139). Varios, y el reparto sale de los cargos que
     * cada uno declara: el de conductores para los conductores, el de analistas para los analistas,
     * y el que no declara ninguno recoge al resto. Un solo formulario sigue siendo una lista de uno.
     */
    formIds: z.array(z.string().uuid()).min(1, 'Un ciclo sin formulario no pregunta nada'),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    selfEvaluation: z.boolean().default(true),
    visibleToEmployee: z.boolean().default(true),
    requiresSignature: z.boolean().default(true),
  })
  .refine((valor) => new Date(valor.endsAt) > new Date(valor.startsAt), {
    message: 'El cierre tiene que ser posterior a la apertura',
    path: ['endsAt'],
  });
export type CycleInput = z.infer<typeof cycleSchema>;

/**
 * Lo que entrega un evaluador. Se manda TODO junto y no respuesta a respuesta: una evaluacion a
 * medias guardada en el servidor invita a que otro la vea antes de tiempo, y quien califica quiere
 * poder cambiar de opinion mientras escribe.
 */
export const reviewSubmitSchema = z.object({
  answers: z
    .array(
      z.object({
        competencyId: z.string().uuid(),
        /** `null` en las competencias de solo texto, o si se deja sin responder. */
        value: z.number().int().min(0).max(10).nullable(),
        comment: z.string().trim().max(1000).nullable().optional(),
      }),
    )
    .min(1),
  comment: z.string().trim().max(2000).nullable().optional(),
});
export type ReviewSubmitInput = z.infer<typeof reviewSubmitSchema>;
