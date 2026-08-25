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
  email: z.string().email().max(120).transform((v) => v.toLowerCase()),
  emailKind: z.enum(['PERSONAL', 'CORPORATE']).default('PERSONAL'),
  jobTitleId: z.string().uuid(),
  areaId: z.string().uuid(),
  regionalId: z.string().uuid().nullable().optional(),
  roleCode: z.enum(['ADMIN', 'ANALISTA', 'USUARIO']).default('USUARIO'),
  hiredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD').nullable().optional(),
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

/** Columnas de la plantilla de carga masiva (CSV/XLSX). Encabezados EXACTOS en espanol. */
export const IMPORT_HEADERS = [
  'documento',
  'nombre_completo',
  'correo',
  'telefono',
  'cargo',
  'area',
  'regional',
  'fecha_ingreso',
  'vinculacion',
] as const;

export const importRowSchema = z.object({
  documento: z.string().min(5).max(20),
  nombre_completo: z.string().min(3).max(160),
  correo: z.string().email().max(120).transform((v) => v.toLowerCase()),
  telefono: z.string().max(20).optional().or(z.literal('')),
  cargo: z.string().min(2).max(40), // code del catalogo job_titles
  area: z.string().min(2).max(40), // code del catalogo areas
  regional: z.string().max(40).optional().or(z.literal('')),
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
        })
        .refine((s) => s.processId || s.areaId, 'Cada ambito debe tener proceso o area'),
    )
    .max(50),
});
export type SetAnalystScopesInput = z.infer<typeof setAnalystScopesSchema>;
