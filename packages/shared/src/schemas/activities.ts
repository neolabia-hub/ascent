import { z } from 'zod';

/**
 * Contratos del CATALOGO FORMATIVO (CLAUDE.md seccion 2, capas 1 y 2).
 *
 *   ACTIVIDAD (que se aprende)  ->  VERSION (que vio exactamente la persona)
 *
 * La actividad es mutable (renombrar, reasignar responsable). La VERSION publicada es
 * INMUTABLE (Decision #6): editar contenido publicado crea la version N+1 por copy-on-publish.
 */

export const modalitySchema = z.enum(['PRESENCIAL', 'VIRTUAL', 'HIBRIDA']);

export const createActivitySchema = z.object({
  code: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[A-Z0-9_-]+$/, 'Solo mayusculas, numeros, guion y guion bajo'),
  name: z.string().min(3).max(200),
  description: z.string().max(4000).nullable().optional(),
  activityTypeId: z.string().uuid(),
  processId: z.string().uuid(),
  responsibleUserId: z.string().uuid().nullable().optional(),
  modality: modalitySchema.default('VIRTUAL'),
  // Alcance (N:M). Se guardan como listas de ids de catalogo.
  normIds: z.array(z.string().uuid()).max(20).default([]),
  serviceIds: z.array(z.string().uuid()).max(20).default([]),
  regionalIds: z.array(z.string().uuid()).max(50).default([]),
  jobTitleIds: z.array(z.string().uuid()).max(200).default([]),
  tags: z.array(z.string().min(1).max(40)).max(20).default([]),
  /**
   * ¿LA ACREDITA UN TERCERO? `null` = lo que diga su tipo, que es el caso normal.
   *
   * Cuando es que si, la lista de asistencia de la jornada pide el numero del certificado y su
   * vencimiento — y esa fecha manda sobre la que calcularia la recurrencia. Vive aqui ademas de en
   * el tipo porque dentro de una misma clase de formacion conviven las dos cosas: la charla de la
   * ARL que no certifica nada y el curso de alturas que si.
   */
  tracksExternalCertificate: z.boolean().nullable().optional(),
  /** ¿Acepta certificacion previa de otra empresa? Vacio = lo que diga su tipo (via C, 2.3). */
  admiteConvalidacion: z.boolean().nullable().optional(),
  /**
   * LAS HORAS QUE ACREDITA LA CONSTANCIA (2026-09-17).
   *
   * El campo existia en el esquema desde el principio —`Activity.certificateHours`, que la version
   * copia al publicar y de donde la constancia saca su cifra— y **ningun endpoint ni ninguna
   * pantalla lo escribia**. Es decir: la casilla "horas" de toda constancia salia vacia, y la del
   * PROGRAMA —que SUMA las de sus modulos— daba siempre cero. Lo destapo el recorrido
   * `scripts/recorridos/programa.mjs`, que es justo para lo que se escribio.
   *
   * Vive en la FICHA y no en la version porque es una propiedad de la formacion, no del contenido:
   * cambiar el material no cambia cuantas horas acredita. La version se queda con la que hubiera el
   * dia en que se publico, que es lo que una constancia tiene que poder repetir años despues.
   */
  certificateHours: z.number().int().min(1).max(2000).nullable().optional(),
});
export type CreateActivityInput = z.infer<typeof createActivitySchema>;

export const updateActivitySchema = createActivitySchema.omit({ code: true }).partial().extend({
  active: z.boolean().optional(),
  /**
   * PORTADA (Decision #88): la clave del archivo ya subido a `/media/upload`. `null` la quita y
   * devuelve la portada generada, que es un estado normal y no un hueco.
   */
  coverKey: z.string().max(500).nullable().optional(),
});
export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;

export const listActivitiesQuerySchema = z.object({
  q: z.string().max(200).optional(),
  activityTypeId: z.string().uuid().optional(),
  processId: z.string().uuid().optional(),
  active: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListActivitiesQuery = z.infer<typeof listActivitiesQuerySchema>;

// ─────────────────────────── Version y sus contenidos ───────────────────────────

export const contentTypeSchema = z.enum([
  'LESSON',
  'VIDEO',
  // Se convierte a una imagen por diapositiva y se reproduce; por eso NO es un DOCUMENT.
  'PRESENTATION',
  'DOCUMENT',
  'ASSESSMENT',
  'SURVEY',
  'SCORM',
  'LINK',
]);

/** Configuracion por tipo de contenido. Lo no aplicable simplemente no se envia. */
export const contentConfigSchema = z
  .object({
    /** VIDEO: porcentaje minimo visto para dar el item por completado. */
    minWatchPct: z.number().int().min(0).max(100).optional(),
    /** DOCUMENT/LESSON: segundos minimos de permanencia (anti "click siguiente"). */
    minSeconds: z.number().int().min(0).max(7200).optional(),
    /** VIDEO: url externa (YouTube/Vimeo) cuando no es archivo subido. */
    externalUrl: z.string().url().max(500).optional(),
    /**
     * Si la persona puede DESCARGAR el archivo original de esta pieza.
     *
     * Existe por la presentacion: se convierte a diapositivas para poder medir que se vio, y
     * entregar ademas el PPT original es una decision del cliente —a veces es material que no
     * quiere que salga de la plataforma—, no algo que deba pasar por defecto. En un documento de
     * apoyo es al reves: consultarlo ES para lo que esta, asi que ahi el valor por defecto es que
     * si se pueda.
     */
    allowDownload: z.boolean().optional(),
    /** LINK: destino del recurso externo. */
    href: z.string().url().max(500).optional(),
  })
  .strict()
  .default({});

export const createContentSchema = z.object({
  type: contentTypeSchema,
  title: z.string().min(2).max(200),
  /**
   * De que va ESTA pieza. No es la descripcion de la actividad: quien entra a la parte 4 de 7
   * quiere saber que va a ver ahora, no de que iba la induccion entera.
   */
  description: z.string().max(2000).nullable().optional(),
  isRequired: z.boolean().default(true),
  config: contentConfigSchema,
  lessonId: z.string().uuid().nullable().optional(),
  contentPackageId: z.string().uuid().nullable().optional(),
  assessmentId: z.string().uuid().nullable().optional(),
  surveyTemplateId: z.string().uuid().nullable().optional(),
});
export type CreateContentInput = z.infer<typeof createContentSchema>;

export const updateContentSchema = createContentSchema.partial().omit({ type: true });
export type UpdateContentInput = z.infer<typeof updateContentSchema>;

export const reorderContentsSchema = z.object({
  /** Ids de contenidos en el orden deseado. Debe incluir TODOS los de la version. */
  orderedIds: z.array(z.string().uuid()).min(1).max(100),
});

/** Ajustes academicos de la version (se resuelven en cascada y se congelan al publicar). */
export const updateVersionSettingsSchema = z.object({
  passingScore: z.number().int().min(1).max(100).optional(),
  maxAttempts: z.number().int().min(1).max(10).optional(),
  retryWaitHours: z.number().int().min(0).max(720).nullable().optional(),
  estimatedMinutes: z.number().int().min(1).max(6000).nullable().optional(),
});
export type UpdateVersionSettingsInput = z.infer<typeof updateVersionSettingsSchema>;

/**
 * Politica de migracion al publicar la version N+1 (Decision #6 / regla de oro 4).
 * Los COMPLETADOS quedan intactos SIEMPRE, en cualquier politica.
 */
export const migrationPolicySchema = z.enum([
  'FINISH_OLD', // quienes van a mitad terminan en la version vieja
  'RESTART_NEW', // quienes van a mitad reinician en la nueva
  'MOVE_NOT_STARTED', // solo los que no han empezado pasan a la nueva (por defecto)
]);

export const publishVersionSchema = z.object({
  migrationPolicy: migrationPolicySchema.default('MOVE_NOT_STARTED'),
  /** Confirmacion explicita: publicar congela la version y no se puede deshacer. */
  confirm: z.literal(true),
});
export type PublishVersionInput = z.infer<typeof publishVersionSchema>;
