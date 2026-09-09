import { z } from 'zod';

/**
 * Login (Decision #32): el tenant se identifica ANTES del login via subdominio.
 * El web resuelve el subdominio y manda el slug; el identificador es cedula O correo
 * (Decision #10: la cedula es la llave estable; el correo es canal).
 */
export const loginSchema = z.object({
  tenantSlug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'Slug invalido'),
  identifier: z.string().min(3).max(120), // cedula o correo
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z
    .string()
    .min(10, 'Minimo 10 caracteres')
    .max(200)
    .regex(/[a-z]/, 'Debe incluir minuscula')
    .regex(/[A-Z]/, 'Debe incluir mayuscula')
    .regex(/[0-9]/, 'Debe incluir numero'),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/**
 * Aceptaciones de activacion de cuenta (primer ingreso):
 * Habeas Data (Ley 1581/2012) + acuerdo de uso de firma electronica (D2364/2012 art. 5).
 * Ambas obligatorias antes de operar; la version de cada politica queda registrada.
 */
export const activationSchema = z.object({
  acceptHabeasData: z.literal(true),
  acceptESignAgreement: z.literal(true),
});
export type ActivationInput = z.infer<typeof activationSchema>;

/**
 * "No puedo entrar" (Decision #97): avisa a quien administra en esa empresa.
 *
 * Mismos campos que el login menos la contrasena —es justo la que no se tiene— y por eso reusa
 * las mismas reglas de forma: el mismo identificador vale para las dos pantallas, y quien lo
 * escriba mal en una lo escribe mal en la otra.
 */
export const helpRequestSchema = loginSchema.omit({ password: true });
export type HelpRequestInput = z.infer<typeof helpRequestSchema>;

/**
 * Ingreso de la capa de PLATAFORMA (Decision #100): el proveedor, no un cliente.
 *
 * Por correo y no por cedula, que es la diferencia visible con el ingreso de siempre: aqui no hay
 * empresa que resolver antes, asi que tampoco hace falta el slug, y una cuenta de proveedor no es
 * un empleado de nadie.
 */
export const platformLoginSchema = z.object({
  email: z.string().email().max(160),
  password: z.string().min(1).max(200),
});
export type PlatformLoginInput = z.infer<typeof platformLoginSchema>;

/**
 * Los datos de contacto del proveedor. Salen en "No puedo entrar" de CUALQUIER cliente que no haya
 * puesto el suyo (ver 3.06), asi que es la unica pieza del producto que un solo texto mal escrito
 * ensucia en todas las empresas a la vez.
 */
export const platformSettingsSchema = z.object({
  supportName: z.string().max(120).default(''),
  supportEmail: z.string().max(160).default(''),
  supportPhone: z.string().max(60).default(''),
  supportNote: z.string().max(300).default(''),
});
export type PlatformSettingsInput = z.infer<typeof platformSettingsSchema>;

/**
 * La foto de perfil (Decision #105). Llega la CLAVE de un fichero ya subido por `/media/upload`,
 * que es donde se valida el tipo real y el tamaño; aqui solo se dice a quien pertenece.
 *
 * `null` es un valor legitimo: quitar la foto y volver a las iniciales.
 */
export const avatarSchema = z.object({
  avatarKey: z.string().max(500).nullable(),
});
export type AvatarInput = z.infer<typeof avatarSchema>;

/**
 * Revocar una constancia (Decision #110). El motivo es OBLIGATORIO y con minimo real: "error" no
 * explica nada seis meses despues, que es justo cuando alguien pregunta por que esta anulada.
 */
export const revokeCertificateSchema = z.object({
  reason: z.string().min(10, 'Explica por que se anula').max(500),
});
export type RevokeCertificateInput = z.infer<typeof revokeCertificateSchema>;
