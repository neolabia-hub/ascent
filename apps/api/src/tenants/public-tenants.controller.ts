import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { tenantBrandingSchema } from '@neo-pulse/shared';
import { Public } from '../common/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { resolverContactoDeAyuda } from './support-contact.js';

/**
 * Datos PUBLICOS del tenant para la pantalla de login (branding por subdominio, Decision #32).
 * Sin auth: expone SOLO nombre y branding, nunca settings ni datos de negocio.
 */
@Controller('public/tenants')
export class PublicTenantsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Public()
  @Get(':slug')
  async bySlug(@Param('slug') slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { name: true, active: true, branding: true, settings: true },
    });
    if (!tenant || !tenant.active) throw new NotFoundException({ code: 'TENANT_NOT_FOUND' });
    const branding = tenantBrandingSchema.parse(tenant.branding ?? {});
    /*
      EL LOGO SALE YA FIRMADO (Decision #96).

      La pantalla de ingreso no tiene sesion, asi que no puede pedir la firma como hace el resto
      del producto: sin esto, la unica pantalla donde la marca de verdad importa seria la unica
      que no la puede enseñar. Y no abre nada — la firma sigue atando clave y caducidad, y lo que
      viaja es el logotipo de la empresa, que es publico por definicion: esta en su fachada.
    */
    const logoUrl = branding.logoKey ? this.storage.signPath(branding.logoKey) : null;
    /*
      EL RESPALDO DEL PROVEEDOR SALE DE LA BASE DE DATOS (Decision #100), ya no de variables de
      entorno. En el `.env` funcionaba, pero corregir un telefono obligaba a entrar al servidor y
      reiniciar la API: tirar la pantalla de ingreso de TODOS los clientes para arreglar un digito.
      Ahora se edita en /plataforma y el cambio es inmediato.

      Se lee en la MISMA peticion que la marca, que ya se pide una vez por carga de esa pantalla:
      una fila por clave primaria no justifica una segunda ida y vuelta.
    */
    const plataforma = await this.prisma.platformSettings.findUnique({ where: { id: 1 } });
    return {
      name: tenant.name,
      branding,
      logoUrl,
      support: resolverContactoDeAyuda(tenant.settings, {
        name: plataforma?.supportName,
        email: plataforma?.supportEmail,
        phone: plataforma?.supportPhone,
        note: plataforma?.supportNote,
      }),
    };
  }
}
