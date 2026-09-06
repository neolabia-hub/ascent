import { z } from 'zod';
import { modalitySchema } from './activities.js';
import { audienceRuleSchema } from './assignments.js';

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

  /**
   * ¿ESTA JORNADA SE CIERRA CON LISTA DE ASISTENCIA? `null` = lo que diga su modalidad.
   *
   * Se pregunta en vez de deducirse porque la regla derivada cambio dos veces en dos dias, las dos
   * por un caso real: una capacitacion del plan con fecha pero virtual y con contenido (no lleva
   * lista) y una que dicta la ARL por videollamada en vivo (si la lleva, y es virtual). La respuesta
   * depende de como se dicto ESA sesion, y eso solo lo sabe quien la programa.
   *
   * El defecto acierta casi siempre —presencial e hibrida si, virtual no— y esto es para lo que no
   * encaja. Ver `cierre-de-la-jornada.ts`.
   */
  closesByAttendance: z.boolean().nullable().optional(),

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

  /**
   * A QUIENES ATIENDE esta jornada: la TAJADA de los obligados que le toca (Decision #68).
   *
   * Se pide como los criterios de Quienes —cargo, area, regional, servicio— y el servidor busca o
   * crea la audiencia correspondiente. La pantalla nunca dice "audiencia".
   *
   * Sin facetas, o ausente, atiende a TODOS los obligados: es el caso simple y el comportamiento
   * de siempre. Con facetas, es lo que evita que dos jornadas de la misma formacion proyecten a
   * la misma gente y el plan las sume.
   */
  audienceScope: audienceRuleSchema.nullable().optional(),
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

/**
 * AJUSTAR los proyectados de una convocatoria YA PUBLICADA (Decision #56).
 *
 * Publicar los congela (regla de oro 3) y esa regla se queda: el denominador de la cobertura debe
 * ser dato, no opinion. Lo que faltaba era la valvula que la propia regla anuncia —"ajuste manual
 * solo con justificacion auditada"— para el caso que pasa siempre: se congelaron 45 y entraron
 * siete personas al area en marzo, asi que el 100% de cobertura seria mentira.
 *
 * El motivo es OBLIGATORIO y no tiene valor por defecto: si nadie escribe por que, dentro de un
 * ano nadie va a saber si el numero se corrigio o se maquillo.
 */
export const adjustProjectedSchema = z.object({
  projectedCount: z.number().int().min(0).max(100000),
  reason: z.string().min(10).max(500),
});
export type AdjustProjectedInput = z.infer<typeof adjustProjectedSchema>;

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

/**
 * EL PAPEL DE UN TERCERO (Decision #157).
 *
 * Alturas, espacios confinados, montacargas, manipulacion de alimentos: la norma exige el
 * certificado de un organismo acreditado, y ahi la empresa es RECEPTORA, no emisora. NEO PULSE no
 * emite ese papel — lo REGISTRA, porque quien necesita saber cuando vence es la empresa.
 *
 * `validUntil` es el unico campo con consecuencias sobre el motor: **manda sobre la vigencia que
 * calcula la recurrencia**. Si la ARL certifica por tres anos y el tipo dice doce meses, reclamarla
 * al ano seria inventar un incumplimiento sobre alguien con su habilitacion vigente y el papel para
 * probarlo. Por eso se copia a la obligacion (`valid_until_override`) y no se queda solo aqui.
 *
 * ─── EL EMISOR NO SE TECLEA POR PERSONA (2026-09-06) ───
 *
 * Lo cazo el cliente: *"si fuera ejecutada por una ARL o externo, el que sea, debe salir automatico;
 * llenarlo cada uno por persona seria mucho trabajo"*. Y es cierto: **quien dicta la jornada ya esta
 * en la jornada** (`executedBy` / `executedByOther`), asi que escribirlo cuarenta veces es copiar a
 * mano un dato que el sistema ya tiene — y garantizar que en la fila 23 alguien escriba "ARL sura".
 *
 * Lo unico que de verdad cambia por persona es **el numero** de su certificado, y su vencimiento si
 * no es el mismo para todos. `issuer` queda opcional: si no viene, lo pone el servidor desde la
 * jornada. Se deja mandarlo para el dia que exista el caso de quien llega con un papel de OTRA
 * entidad, sacado en otro empleo.
 */
export const certificadoExternoSchema = z.object({
  /** Quien lo expide. Opcional: por defecto, quien dicto la jornada. */
  issuer: z.string().trim().min(2).max(160).optional(),
  number: z.string().trim().min(1).max(80),
  issuedAt: z.string().date().optional(),
  /** Lo que dice el papel. Si viene, MANDA sobre lo que calcula la recurrencia. */
  validUntil: z.string().date().optional(),
  /** El escaneo, ya subido a almacenamiento. */
  fileKey: z.string().max(500).optional(),
});
export type CertificadoExternoInput = z.infer<typeof certificadoExternoSchema>;

/**
 * CERRAR UNA JORNADA POR ASISTENCIA (Decision #157).
 *
 * La segunda de las tres vias de evidencia. Hasta aqui una ejecucion solo se cerraba de UNA forma
 * —la persona entrando a la plataforma y completando el contenido— y en una empresa bajo SG-SST la
 * mayor parte del plan anual se dicta en salon: charlas de seguridad vial, brigadas, lo que trae la
 * ARL. De eso no queda contenido que completar; queda una LISTA DE ASISTENCIA firmada, que es la
 * evidencia que pide el auditor. Sin esto, todo lo dictado presencialmente contaba como incumplido.
 *
 * Se manda la lista ENTERA de la jornada, no una persona: marcar asistencia es un acto sobre el
 * grupo —se lee la hoja firmada de arriba abajo— y mandar uno por uno dejaria a medias la jornada
 * si el navegador se cae en el decimoquinto.
 *
 * LOS TRES ESTADOS, y el cuarto que es no mandar la fila. "Convocado y NO vino" es justo lo que
 * hay que poder demostrar, y es distinto de "no lo hemos revisado todavia" — por eso el estado es
 * explicito y no se deduce de un campo vacio.
 *
 * **JUSTIFIED no exime la formacion**, y es deliberado: explica por que no vino a ESA jornada, no
 * que ya no tenga que formarse. La sigue debiendo y va a la siguiente. Eximir es otro acto, con su
 * propio motivo y su propia auditoria.
 *
 * Lo que se escribe es un `AttendanceRecord` —la tabla que ya estaba en el esquema desde el Sprint
 * 5— con `method: INSTRUCTOR`. Los otros dos metodos que preve el diseno (QR de sesion y firma en
 * pantalla) comparten esa misma tabla cuando se construyan.
 */
export const asistenciaEstadoSchema = z.enum(['PRESENT', 'ABSENT', 'JUSTIFIED']);
export type AsistenciaEstado = z.infer<typeof asistenciaEstadoSchema>;

export const marcarAsistenciaSchema = z.object({
  /** El dia en que se dicto. Por defecto, hoy. */
  heldOn: z.string().date().optional(),
  /** El acta firmada: UNA por jornada, no una por persona. */
  attendanceSheetKey: z.string().max(500).optional(),
  items: z
    .array(
      z
        .object({
          enrollmentId: z.string().uuid(),
          estado: asistenciaEstadoSchema,
          /** Por que se justifico. Obligatorio en JUSTIFIED: una justificacion sin motivo no
           *  justifica nada, y es lo que el auditor va a leer. */
          motivo: z.string().trim().max(500).optional(),
          certificate: certificadoExternoSchema.optional(),
        })
        .superRefine((value, ctx) => {
          if (value.estado === 'JUSTIFIED' && (value.motivo ?? '').length < 5) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['motivo'], message: 'Escribe por que se justifica.' });
          }
          if (value.estado !== 'PRESENT' && value.certificate) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['certificate'],
              message: 'Solo se registra el certificado de quien asistio.',
            });
          }
        }),
    )
    .min(1)
    .max(500),
});
export type MarcarAsistenciaInput = z.infer<typeof marcarAsistenciaSchema>;

/**
 * APUNTAR LA CONVOCATORIA A OTRA VERSION.
 *
 * Publicar la v2 de una formacion NO tocaba a nadie: la convocatoria seguia colgada de la v1
 * (ya RETIRADA) y el aprendiz seguia viendo contenido viejo sin que nadie se enterara. Mover la
 * convocatoria es un acto deliberado y con consecuencias sobre gente ya citada, por eso:
 *
 *  - la version destino se manda EXPLICITA (`targetVersionId`): si alguien publica una v3
 *    mientras la pantalla estaba abierta, esto falla en vez de mover a una version que el
 *    administrador nunca vio;
 *  - a quien mueve y a quien no lo decide la POLITICA DE MIGRACION que se eligio al publicar la
 *    version destino (`FINISH_OLD`, `MOVE_NOT_STARTED`, `RESTART_NEW`), no esta llamada. La
 *    politica ya es una decision tomada y auditada; repetirla aqui permitiria contradecirla.
 */
export const migrateOfferingVersionSchema = z.object({
  targetVersionId: z.string().uuid(),
  justification: z.string().min(10).max(500).optional(),
  confirm: z.literal(true),
});
export type MigrateOfferingVersionInput = z.infer<typeof migrateOfferingVersionSchema>;

/**
 * PREVISUALIZAR LOS PROYECTADOS mientras se arma la convocatoria, antes de que exista.
 *
 * Existe porque la tarjeta de la tajada preguntaba lo que no era: contaba a cuanta gente DE LA
 * EMPRESA encajaba con las facetas —con los campos vacios, la plantilla entera— cuando lo que se
 * congela al publicar es otra cosa, los OBLIGADOS que caen dentro. El numero que se veia al
 * cortar no era el numero que se guardaba.
 *
 * Se responde con el mismo servicio que congela (`ProjectedAudienceService`), no con una consulta
 * parecida: si fueran dos caminos, volverian a separarse.
 */
export const previewProjectedSchema = z.object({
  activityVersionId: z.string().uuid(),
  /** La tajada que se esta marcando. Sin facetas = toda la formacion. */
  scope: audienceRuleSchema,
  /** La sede, que acota solo cuando no hay tajada declarada. */
  regionalId: z.string().uuid().nullable().default(null),
});
export type PreviewProjectedInput = z.infer<typeof previewProjectedSchema>;
