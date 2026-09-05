import { z } from 'zod';
import { fixedDateSchema } from './fixed-date.js';
import { onExpirySchema } from './assignments.js';

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

/**
 * UN SOLO CAMPO PARA "EL JEFE DEL AREA" (Decision #135).
 *
 * Habia dos —`managerUserId` y `responsibleUserId`— que significaban lo mismo, y cada funcion leia
 * uno distinto: el aviso de "alguien reprobo" miraba el primero y la evaluacion de eficacia el
 * segundo. Ninguno se podia rellenar desde la interfaz, asi que las dos llevaban desde el Sprint 5
 * apuntando a un vacio, y nadie lo noto: no hay error cuando no hay a quien avisar.
 *
 * Se queda `responsibleUserId`, que es como se llama el equivalente en `processes`: quien responde
 * por esto.
 */
export const areaSchema = catalogBaseSchema.extend({
  parentId: z.string().uuid().nullable().optional(),
  responsibleUserId: z.string().uuid().nullable().optional(),
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
    /**
     * Como se dicta por defecto, y por tanto QUE CAMPOS pide su convocatoria.
     *
     *   EVENT     jornada con fecha: pide instructor, ejecutada por, lugar, horario y cupo.
     *   PERMANENT disponible para hacerla cuando se pueda: no pide nada de eso.
     *
     * Vive aqui y no en el codigo porque una pildora no lleva instructor y una capacitacion del
     * plan si, y donde esta la frontera la decide cada empresa, no nosotros.
     */
    defaultOfferingKind: z.enum(['EVENT', 'PERMANENT', 'HYBRID']).default('PERMANENT'),
    defaultRecurrenceMonths: z.number().int().min(1).max(120).nullable().default(null),
    /**
     * "Cada ano antes del 31 de marzo" (MM-DD). Es la CAMPANA anual, y es como funciona de verdad
     * una reinduccion: no es la induccion repetida a los 12 meses de que cada quien la hiciera,
     * es una obligacion de CALENDARIO que cae sobre todo el mundo el mismo dia.
     *
     * La diferencia no es cosmetica: con el modelo por persona, alguien que nunca hizo la
     * induccion no tendria de donde contar sus 12 meses. Con la campana no hace falta anclarse a
     * nada: el 31 de marzo llega igual para todos.
     *
     * Manda sobre `defaultRecurrenceMonths` cuando las dos estan puestas.
     */
    defaultAnnualDate: fixedDateSchema.nullable().default(null),
    /**
     * QUE PASA CUANDO LLEGA LA RONDA SIGUIENTE Y LA ANTERIOR NO SE HIZO. Ver `onExpirySchema`.
     *
     * Es politica de la EMPRESA y no de cada formacion —"aqui la campana cierra y se pasa de ano"
     * o "aqui hay que ponerse al dia primero"—, por eso vive en el tipo. Llega al requisito cuando
     * se crea, y desde ahi lo lee el motor.
     */
    defaultOnExpiry: onExpirySchema.default('ESPERA'),
    /**
     * NO SE LE EXIGE A QUIEN INGRESO HACE MENOS DE N MESES (2026-09-04).
     *
     * La campana anual alcanzaba tambien a quien entro la semana pasada y todavia esta haciendo su
     * induccion: se le encima la actualizacion del ano sobre una induccion a medio hacer, y es
     * redundante — **su induccion ES su actualizacion de ese ano**. Lo habitual en las empresas es
     * dejar fuera del ciclo a quien ingreso dentro de el.
     *
     * Sin esto habia que eximir a mano a cada ingreso reciente: en TRANSPRENSA son ~50 al ano, cada
     * uno con su motivo escrito, para decir cincuenta veces lo mismo.
     *
     * `0` o sin poner = no se excluye a nadie, que es como se comportaba antes. Vive en el TIPO
     * porque es politica de empresa, igual que la fecha de la campana: si cada reinduccion eligiera
     * su propio corte, no habria "la reinduccion de 2026" que ensenarle a un auditor.
     */
    exemptRecentHiresMonths: z.number().int().min(0).max(24).default(0),
    participatesInPlan: z.boolean().default(false),
    isMicro: z.boolean().default(false),
    /**
     * CUAL encuesta usa este tipo (Decision #116). Se engancha sola al final de cada formacion.
     *
     * Faltaba declararla aqui, y este esquema es `.strict()`: elegirla en la pantalla devolvia un
     * 422 seco, sin mas explicacion que "Unprocessable Entity". Es el precio de `.strict()` —que
     * es la opcion correcta: sin el, una clave mal escrita se guardaria en silencio y no
     * gobernaria nada— y por eso **cada campo nuevo del config hay que declararlo aqui ademas de
     * leerlo donde se use**.
     */
    surveyTemplateId: z.string().max(60).nullable().default(null),
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
