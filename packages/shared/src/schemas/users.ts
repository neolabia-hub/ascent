import { z } from 'zod';

/** Contratos del modulo de personas (CLAUDE.md 3.3). */

export const documentTypeSchema = z.enum(['CEDULA', 'CE', 'PASAPORTE', 'NIT']);
export const employmentTypeSchema = z.enum(['DIRECTO', 'CONTRATISTA', 'TEMPORAL', 'EN_MISION']);
export const roadActorSchema = z.enum(['CONDUCTOR', 'MOTOCICLISTA', 'CICLISTA', 'PEATON', 'PASAJERO']);

export const createUserSchema = z.object({
  documentType: documentTypeSchema.default('CEDULA'),
  documentNumber: z
    .string()
    .min(5)
    .max(20)
    .regex(/^[0-9A-Za-z-]+$/, 'Documento invalido'),
  fullName: z.string().min(3).max(160),
  phone: z.string().min(7).max(20).nullable().optional(),
  /**
   * OPCIONAL: hay gente que no tiene correo (2026-09-21).
   *
   * Vacio o ausente se guarda como NULO, y nulo significa exactamente eso — no una direccion
   * inventada. Quien no tiene correo **entra con su cedula**, que siempre sirve (Decision #10); lo
   * unico que pierde es lo que se manda por correo, y por eso tiene que constar.
   *
   * La cadena vacia se acepta y se convierte en `null` porque un formulario manda `''` cuando el
   * campo se deja en blanco: rechazarla obligaria a la pantalla a distinguir «vacio» de «no vino»,
   * que es una distincion que no existe para quien lo rellena.
   *
   * ─── PERO `undefined` SE CONSERVA, Y ESO NO ES UN DETALLE ───
   *
   * `updateUserSchema` es este esquema en `.partial()`, asi que al editar a alguien el correo puede
   * simplemente NO VENIR. Si la transformacion convirtiera tambien `undefined` en `null`, **guardar
   * cualquier cambio de una ficha borraria el correo de esa persona** sin que nadie lo pidiera.
   *
   *   `undefined` -> no vino, no se toca
   *   `''` o null -> lo dejaron en blanco a proposito: esta persona no tiene correo
   */
  email: z
    .union([z.string().email().max(120), z.literal(''), z.null()])
    .optional()
    .transform((v) => (v === undefined ? undefined : v ? v.toLowerCase() : null)),
  emailKind: z.enum(['PERSONAL', 'CORPORATE']).default('PERSONAL'),
  jobTitleId: z.string().uuid(),
  areaId: z.string().uuid(),
  regionalId: z.string().uuid().nullable().optional(),
  /** Linea de servicio. Opcional: hay empresas que no organizan asi a su gente. */
  serviceId: z.string().uuid().nullable().optional(),
  roleCode: z.enum(['ADMIN', 'ANALISTA', 'USUARIO']).default('USUARIO'),
  hiredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD').nullable().optional(),
  /** Opcional: hay empresas que no la piden al vincular. Nunca bloquea un alta. */
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD').nullable().optional(),
  employmentType: employmentTypeSchema.default('DIRECTO'),
  roadActor: roadActorSchema.nullable().optional(),
  // Si no viene, el sistema GENERA una contrasena segura (cedula + caracteres) y la devuelve
  // UNA sola vez en la respuesta de creacion.
  password: z
    .string()
    .min(10)
    .max(200)
    .regex(/[a-z]/)
    .regex(/[A-Z]/)
    .regex(/[0-9]/)
    .optional(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = createUserSchema
  .omit({ documentNumber: true, documentType: true, password: true })
  .partial()
  .extend({
    active: z.boolean().optional(),
  });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const listUsersQuerySchema = z.object({
  q: z.string().max(120).optional(),
  areaId: z.string().uuid().optional(),
  roleCode: z.string().max(40).optional(),
  active: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

/** Columnas de la plantilla de carga masiva (CSV/XLSX). Encabezados EXACTOS en español. */
export const IMPORT_HEADERS = [
  'documento',
  'nombre_completo',
  'correo',
  'telefono',
  'cargo',
  'tipo_cargo',
  'area',
  // Detras de `area` a proposito: se lee «Gestion Humana › Nomina» en el mismo orden que el arbol.
  'sub_area',
  'regional',
  'servicio',
  'fecha_ingreso',
  'fecha_nacimiento',
  'vinculacion',
] as const;

export const importRowSchema = z.object({
  documento: z.string().min(5).max(20),
  nombre_completo: z.string().min(3).max(160),
  /**
   * OPCIONAL desde el 2026-09-21: hay gente que no tiene correo, y rechazar su fila empujaba a
   * inventar una direccion. Vacia = sin correo, y esa persona entra con su cedula.
   */
  correo: z
    .union([z.string().email().max(120), z.literal('')])
    .optional()
    .transform((v) => (v ? v.toLowerCase() : null)),
  telefono: z.string().max(20).optional().or(z.literal('')),
  cargo: z.string().min(2).max(40), // code o nombre del catalogo job_titles
  /**
   * SOLO HACE FALTA SI EL CARGO TODAVIA NO EXISTE.
   *
   * Un cargo no se puede crear solo con su nombre: la ficha exige un TIPO —Administrativo,
   * Operativo o Comercial, tabla `job_title_types`— y adivinarlo por el nombre del cargo seria
   * clasificar a alguien en silencio. Si esta columna trae el codigo o el nombre de un tipo ya
   * configurado, el cargo nuevo se crea con esa clasificacion; si no, la fila falla explicando
   * por que, en vez de crear un cargo sin tipo o inventarle uno al azar.
   */
  tipo_cargo: z.string().max(40).optional().or(z.literal('')),
  area: z.string().min(2).max(40), // code o nombre del catalogo areas
  /**
   * LA SUB-AREA, si la empresa las usa (2026-09-17).
   *
   * Gestion Humana tiene Nomina, Contratacion y Seleccion. Cuando viene, **la persona queda en la
   * SUB-AREA**, y esa sub-area se crea colgando del area de la columna anterior.
   *
   * Importa mas de lo que parece: el area de la persona decide **quien la evalua** —el evaluador es
   * el responsable de esa area, ver `planificarEvaluaciones`—. Sin esta columna, evaluar por
   * jefaturas obligaba a poner la sub-area en `area` y despues enlazarla a mano, dejando una
   * ventana en la que esa gente colgaba de un area huerfana y se caia de las reglas por area.
   *
   * Vacia = la persona queda en el area, como siempre. Quien no maneje sub-areas no la nota.
   */
  sub_area: z.string().max(40).optional().or(z.literal('')),
  regional: z.string().max(40).optional().or(z.literal('')),
  // Opcionales las dos: un cliente que no las maneje deja la columna vacia y su carga entra igual.
  servicio: z.string().max(40).optional().or(z.literal('')),
  fecha_nacimiento: z
    .string()
    .regex(/^d{4}-d{2}-d{2}$/)
    .optional()
    .or(z.literal('')),
  fecha_ingreso: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal('')),
  vinculacion: employmentTypeSchema.optional().or(z.literal('')),
});
export type ImportRowInput = z.infer<typeof importRowSchema>;

export const setOverridesSchema = z.object({
  overrides: z
    .array(z.object({ permissionCode: z.string().min(3).max(80), granted: z.boolean() }))
    .max(100),
});
export type SetOverridesInput = z.infer<typeof setOverridesSchema>;

export const setAnalystScopesSchema = z.object({
  scopes: z
    .array(
      z
        .object({
          processId: z.string().uuid().nullable().optional(),
          areaId: z.string().uuid().nullable().optional(),
          /** Tercera dimension del alcance: que TIPOS de formacion puede tocar (2026-09-22). */
          activityTypeId: z.string().uuid().nullable().optional(),
        })
        .refine(
          (s) => s.processId || s.areaId || s.activityTypeId,
          'Cada ambito debe tener proceso, area o tipo de formacion',
        ),
    )
    .max(50),
});
export type SetAnalystScopesInput = z.infer<typeof setAnalystScopesSchema>;

/**
 * QUE TIPOS DE FORMACION PUEDE TOCAR UN ROL (2026-09-22).
 *
 * Se manda el conjunto ENTERO y no altas y bajas sueltas: la pantalla marca casillas y guarda. Con
 * operaciones por tipo, dos pestañas abiertas se pisan y gana la ultima en llegar.
 *
 * **Lista vacia = sin acotar**, que es como nacen todos los roles. Acotar es un acto deliberado.
 */
export const alcancePorTipoSchema = z.object({
  activityTypeIds: z.array(z.string().uuid()).max(50),
});
export type AlcancePorTipoInput = z.infer<typeof alcancePorTipoSchema>;
