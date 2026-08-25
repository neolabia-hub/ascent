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
