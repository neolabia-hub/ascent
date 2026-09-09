import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { certificateTemplateSchema, CAMPOS_POR_DEFECTO } from '@neo-pulse/shared';
import { Prisma } from '@prisma/client';
import { AuditService } from '../common/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * LAS PLANTILLAS DE CONSTANCIA de una empresa (Decision #112).
 *
 * El cliente sube su arte y coloca los campos encima. Aqui vive lo que gobierna esa pantalla.
 */
@Injectable()
export class CertificateTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.scoped.certificateTemplate.findMany({
      orderBy: [{ active: 'desc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        name: true,
        backgroundKey: true,
        landscape: true,
        active: true,
        versionNumber: true,
        updatedAt: true,
      },
    });
  }

  async get(id: string) {
    const plantilla = await this.prisma.scoped.certificateTemplate.findUnique({ where: { id } });
    if (!plantilla) throw new NotFoundException({ code: 'TEMPLATE_NOT_FOUND' });
    return plantilla;
  }

  async create(tenantId: string, actorId: string, body: unknown) {
    const input = certificateTemplateSchema.parse(body);
    const plantilla = await this.prisma.scoped.certificateTemplate.create({
      data: {
        tenantId,
        name: input.name,
        backgroundKey: input.backgroundKey,
        landscape: input.landscape,
        // Una plantilla nueva nace con los campos colocados en un sitio sensato, no vacia: una
        // hoja con el arte y sin el nombre de nadie parece que el sistema esta roto.
        fields: (Object.keys(input.fields).length > 0 ? input.fields : CAMPOS_POR_DEFECTO) as Prisma.InputJsonValue,
        signers: input.signers as unknown as Prisma.InputJsonValue,
        // NUNCA nace activa: se crea, se sube el arte, se coloca, se mira la vista previa y
        // entonces se activa. Activar es el acto de decir "esto es lo que se entrega".
        active: false,
      },
    });
    await this.audit.record({
      tenantId,
      userId: actorId,
      action: 'CERTIFICATE_TEMPLATE_CREATED',
      resourceType: 'certificate_templates',
      resourceId: plantilla.id,
      newValues: { name: plantilla.name },
    });
    return plantilla;
  }

  async update(tenantId: string, actorId: string, id: string, body: unknown) {
    const previa = await this.get(id);
    const input = certificateTemplateSchema.parse(body);

    /*
      NO SE PUEDE ACTIVAR SIN ARTE. Una plantilla activa es la que se usa al emitir, y sin fondo
      saldrian constancias en hoja blanca con cuatro lineas de texto sueltas. Es mejor no emitir
      —que queda registrado y se ve— que emitir un papel que nadie querria enseñar.
    */
    if (input.active && !input.backgroundKey) {
      throw new BadRequestException({
        code: 'TEMPLATE_WITHOUT_BACKGROUND',
        message: 'Sube el diseño de la constancia antes de activarla.',
      });
    }

    /*
      LA VERSION SUBE CUANDO CAMBIA EL DISENO, no cuando se corrige el nombre de la plantilla.

      Cada constancia guarda con que version se emitio, asi que subirla en cada guardado —incluido
      renombrar— llenaria el historial de versiones que no cambian nada y haria imposible saber
      cual fue el cambio real. Solo cuenta lo que altera el papel: el arte, la orientacion, donde
      van los campos y quien firma.
    */
    const cambioElDiseno =
      previa.backgroundKey !== input.backgroundKey ||
      previa.landscape !== input.landscape ||
      JSON.stringify(previa.fields) !== JSON.stringify(input.fields) ||
      JSON.stringify(previa.signers) !== JSON.stringify(input.signers);

    const plantilla = await this.prisma.scoped.certificateTemplate.update({
      where: { id },
      data: {
        name: input.name,
        backgroundKey: input.backgroundKey,
        landscape: input.landscape,
        fields: input.fields as Prisma.InputJsonValue,
        signers: input.signers as unknown as Prisma.InputJsonValue,
        active: input.active,
        ...(cambioElDiseno && { versionNumber: previa.versionNumber + 1 }),
      },
    });

    /*
      UNA SOLA ACTIVA. Al activar esta, las demas se apagan.

      La emision coge "la activa mas reciente"; con dos activas, cual gana dependeria del orden de
      actualizacion, y dos personas que terminan la misma formacion el mismo dia podrian recibir
      constancias con diseños distintos. Se resuelve aqui y no con una restriccion en la base de
      datos porque una restriccion obligaria a apagar la anterior en una peticion aparte, y entre
      las dos peticiones no habria ninguna activa.
    */
    if (plantilla.active) {
      await this.prisma.scoped.certificateTemplate.updateMany({
        where: { id: { not: id }, active: true },
        data: { active: false },
      });
    }

    await this.audit.record({
      tenantId,
      userId: actorId,
      action: 'CERTIFICATE_TEMPLATE_UPDATED',
      resourceType: 'certificate_templates',
      resourceId: id,
      oldValues: { active: previa.active, versionNumber: previa.versionNumber },
      newValues: { active: plantilla.active, versionNumber: plantilla.versionNumber },
    });
    return plantilla;
  }

  /**
   * BORRAR solo si nunca se uso.
   *
   * Una plantilla con constancias emitidas no se puede borrar: cada constancia la referencia para
   * poder reimprimirse exactamente como se entrego. Lo que se hace con una que ya no se usa es
   * desactivarla, y entonces deja de emitir sin romper el pasado.
   */
  async remove(tenantId: string, actorId: string, id: string) {
    const usos = await this.prisma.scoped.certificate.count({ where: { templateId: id } });
    if (usos > 0) {
      throw new BadRequestException({
        code: 'TEMPLATE_IN_USE',
        message: `Ya se emitieron ${usos} constancia(s) con esta plantilla. Desactivala en vez de borrarla.`,
      });
    }
    await this.prisma.scoped.certificateTemplate.delete({ where: { id } });
    await this.audit.record({
      tenantId,
      userId: actorId,
      action: 'CERTIFICATE_TEMPLATE_DELETED',
      resourceType: 'certificate_templates',
      resourceId: id,
    });
    return { ok: true as const };
  }
}
