import { tenantSettingsSchema } from '@neo-pulse/shared';

export interface SupportContact {
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  note: string;
  /** De quien es el contacto. La pantalla de ingreso escribe cosas distintas segun cual sea. */
  scope: 'tenant' | 'platform';
}

export interface PlatformSupport {
  name?: string;
  email?: string;
  phone?: string;
  note?: string;
}

/**
 * A QUIEN ACUDIR cuando alguien no puede entrar (Decision #97).
 *
 * DOS NIVELES, y el orden importa. Manda el de la empresa: quien puede restablecer una contrasena
 * de verdad es quien administra alli, y es la respuesta de minutos. Si no lo han configurado
 * —que es lo normal el primer dia— sale el de la plataforma. Sin ese respaldo, la pantalla diria
 * "pideselo a quien administra" sin decir a quien, que es no decir nada.
 *
 * BASTA CON QUE HAYA UNO DE LOS TRES CAMPOS para considerar que la empresa lo configuro. Exigir
 * los tres haria que una empresa que solo quiere publicar una extension cayera al respaldo sin
 * enterarse, y veria salir un contacto ajeno en su propia pantalla de ingreso.
 *
 * Devuelve `null` cuando no hay ninguno de los dos: entonces la pantalla no ensena una tarjeta de
 * contacto vacia, solo el boton de avisar.
 */
export function resolverContactoDeAyuda(settings: unknown, plataforma: PlatformSupport): SupportContact | null {
  const propio = tenantSettingsSchema.parse(settings ?? {}).support;
  if (propio.contactName || propio.contactEmail || propio.contactPhone) {
    return { ...propio, scope: 'tenant' };
  }

  const contactName = plataforma.name ?? '';
  const contactEmail = plataforma.email ?? '';
  const contactPhone = plataforma.phone ?? '';
  if (!contactName && !contactEmail && !contactPhone) return null;

  return { contactName, contactEmail, contactPhone, note: plataforma.note ?? '', scope: 'platform' };
}
