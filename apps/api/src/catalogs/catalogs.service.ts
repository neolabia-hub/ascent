import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  activityTypeSchema,
  activityTypeUpdateSchema,
  areaSchema,
  areaUpdateSchema,
  jobTitleSchema,
  jobTitleTypeSchema,
  jobTitleTypeUpdateSchema,
  jobTitleUpdateSchema,
  normSchema,
  normUpdateSchema,
  processSchema,
  processUpdateSchema,
  regionalSchema,
  regionalUpdateSchema,
  serviceSchema,
  serviceUpdateSchema,
} from '@neo-pulse/shared';
import { AuditService } from '../common/audit.service.js';
import type { AuthUser } from '../common/types.js';
import { PrismaService, type TenantPrisma } from '../prisma/prisma.service.js';

/**
 * Modulo de catalogos parametrizables del tenant (CLAUDE.md 3.2). Ocho catalogos comparten la
 * misma forma (code/name/active/displayOrder + campos propios): en vez de repetir el CRUD ocho
 * veces, cada catalogo se describe una sola vez en `CATALOG_DESCRIPTORS` y los metodos publicos
 * (list/create/update/remove) son el UNICO lugar con la logica de negocio (validacion, duplicado
 * de code, chequeo de referencias, auditoria). El tipado de cada delegate de Prisma es distinto
 * (campos propios por modelo), asi que cada descriptor cierra sobre SU delegate concreto: eso
 * evita `any` sin necesitar generics inviables sobre `PrismaClient`.
 */

/** Representacion generica de un registro de catalogo para la respuesta HTTP y la auditoria. */
type CatalogRecord = Record<string, unknown>;

/**
 * Un grupo de filas que impide borrar: cuantas son y como se llaman EN LA PANTALLA.
 *
 * El nombre no es el de la tabla —`activity_job_titles` no le dice nada a nadie— sino la palabra
 * del negocio, en singular y plural, porque el mensaje se arma con el conteo delante.
 */
interface Referencia {
  count: number;
  one: string;
  many: string;
}

const cuenta = (count: number, one: string, many: string): Referencia => ({ count, one, many });

export const CATALOG_KEYS = [
  'areas',
  'processes',
  'job-title-types',
  'job-titles',
  'services',
  'regionals',
  'norms',
  'activity-types',
] as const;

export type CatalogKey = (typeof CATALOG_KEYS)[number];

interface CatalogDescriptor {
  /** list: SIEMPRE incluye inactivos (el front filtra); ordenado por displayOrder. */
  list: (prisma: TenantPrisma) => Promise<CatalogRecord[]>;
  findById: (prisma: TenantPrisma, id: string) => Promise<CatalogRecord | null>;
  create: (prisma: TenantPrisma, tenantId: string, body: unknown) => Promise<CatalogRecord>;
  update: (prisma: TenantPrisma, id: string, body: unknown) => Promise<CatalogRecord>;
  remove: (prisma: TenantPrisma, id: string) => Promise<void>;
  /**
   * Quien referencia este registro, DESGLOSADO (bloquea el borrado fisico si suma > 0).
   *
   * Antes devolvia solo un numero y la pantalla acababa diciendo "esta en uso" a secas: cierto,
   * inutil y sin salida —quien lo lee no sabe si estorban tres formaciones o doscientas personas, ni
   * donde ir a mirar—. El desglose viaja al cliente para que el mensaje diga QUE lo usa y cuanto.
   */
  references: (prisma: TenantPrisma, id: string) => Promise<Referencia[]>;
  /** Solo activity-types: is_system=true no se puede borrar (catalogo protegido de fabrica). */
  isSystemProtected?: (record: CatalogRecord) => boolean;
}

const CATALOG_DESCRIPTORS: Record<CatalogKey, CatalogDescriptor> = {
  areas: {
    list: (prisma) =>
      prisma.area.findMany({
        orderBy: { displayOrder: 'asc' },
        include: { responsible: { select: { id: true, fullName: true } } },
      }),
    findById: (prisma, id) => prisma.area.findUnique({ where: { id } }),
    create: async (prisma, tenantId, body) => {
      const data = areaSchema.parse(body);
      return prisma.area.create({
        data: {
          tenantId,
          code: data.code,
          name: data.name,
          active: data.active,
          displayOrder: data.displayOrder,
          parentId: data.parentId ?? null,
          responsibleUserId: data.responsibleUserId ?? null,
        },
      });
    },
    update: async (prisma, id, body) => {
      const data = areaUpdateSchema.parse(body);
      /*
        UN AREA NO PUEDE COLGAR DE SI MISMA NI DE SU PROPIA RAMA (2026-09-17).

        El arbol (`parentId`) existia desde el principio sin ninguna pantalla que lo rellenara; al
        abrirlo para declarar SUB-AREAS —Nomina bajo Gestion Humana— el desplegable lista todas las
        areas, incluida la que se esta editando y sus hijas.

        Un ciclo no da error al guardar: **cuelga la lectura** el dia que alguien recorra el arbol
        para agrupar, y el sintoma aparece lejisimos de la causa. Se comprueba en el SERVIDOR y no
        filtrando el desplegable, porque una lista filtrada no es un control: la API sigue
        aceptando lo que le manden.
      */
      if (data.parentId) {
        if (data.parentId === id) {
          throw new BadRequestException({ code: 'AREA_PARENT_SELF', message: 'Un área no puede ser su propia área padre.' });
        }
        const todas = await prisma.area.findMany({ select: { id: true, parentId: true } });
        const padreDe = new Map(todas.map((a) => [a.id, a.parentId]));
        // Se sube desde el padre propuesto: si por el camino se llega a esta area, es un ciclo.
        let subiendo: string | null | undefined = data.parentId;
        const vistos = new Set<string>();
        while (subiendo && !vistos.has(subiendo)) {
          if (subiendo === id) {
            throw new BadRequestException({
              code: 'AREA_PARENT_CYCLE',
              message: 'Esa área ya cuelga de esta, así que no puede ser además su padre.',
            });
          }
          vistos.add(subiendo);
          subiendo = padreDe.get(subiendo);
        }
      }
      return prisma.area.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.active !== undefined && { active: data.active }),
          ...(data.displayOrder !== undefined && { displayOrder: data.displayOrder }),
          ...(data.parentId !== undefined && { parentId: data.parentId }),
          ...(data.responsibleUserId !== undefined && { responsibleUserId: data.responsibleUserId }),
        },
      });
    },
    remove: async (prisma, id) => {
      await prisma.area.delete({ where: { id } });
    },
    references: async (prisma, id) => {
      const [users, processes, analystScopes] = await Promise.all([
        prisma.user.count({ where: { areaId: id } }),
        prisma.process.count({ where: { areaId: id } }),
        prisma.analystScope.count({ where: { areaId: id } }),
      ]);
      return [
        cuenta(users, 'persona', 'personas'),
        cuenta(processes, 'proceso', 'procesos'),
        cuenta(analystScopes, 'alcance de analista', 'alcances de analista'),
      ];
    },
  },

  processes: {
    // El area viaja con el proceso: la pantalla la muestra en la tabla y el alcance por area
    // se lee de ahi (Decision #57).
    list: (prisma) =>
      prisma.process.findMany({
        orderBy: { displayOrder: 'asc' },
        include: {
          area: { select: { id: true, name: true } },
          responsible: { select: { id: true, fullName: true } },
        },
      }),
    findById: (prisma, id) => prisma.process.findUnique({ where: { id } }),
    create: async (prisma, tenantId, body) => {
      const data = processSchema.parse(body);
      return prisma.process.create({
        data: {
          tenantId,
          code: data.code,
          name: data.name,
          active: data.active,
          displayOrder: data.displayOrder,
          responsibleUserId: data.responsibleUserId ?? null,
          areaId: data.areaId ?? null,
        },
      });
    },
    update: async (prisma, id, body) => {
      const data = processUpdateSchema.parse(body);
      return prisma.process.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.active !== undefined && { active: data.active }),
          ...(data.displayOrder !== undefined && { displayOrder: data.displayOrder }),
          ...(data.responsibleUserId !== undefined && { responsibleUserId: data.responsibleUserId }),
          ...(data.areaId !== undefined && { areaId: data.areaId }),
        },
      });
    },
    remove: async (prisma, id) => {
      await prisma.process.delete({ where: { id } });
    },
    references: async (prisma, id) => {
      const [activities, analystScopes] = await Promise.all([
        prisma.activity.count({ where: { processId: id } }),
        prisma.analystScope.count({ where: { processId: id } }),
      ]);
      return [
        cuenta(activities, 'formacion', 'formaciones'),
        cuenta(analystScopes, 'alcance de analista', 'alcances de analista'),
      ];
    },
  },

  'job-title-types': {
    list: (prisma) => prisma.jobTitleType.findMany({ orderBy: { displayOrder: 'asc' } }),
    findById: (prisma, id) => prisma.jobTitleType.findUnique({ where: { id } }),
    create: async (prisma, tenantId, body) => {
      const data = jobTitleTypeSchema.parse(body);
      return prisma.jobTitleType.create({
        data: {
          tenantId,
          code: data.code,
          name: data.name,
          active: data.active,
          displayOrder: data.displayOrder,
        },
      });
    },
    update: async (prisma, id, body) => {
      const data = jobTitleTypeUpdateSchema.parse(body);
      return prisma.jobTitleType.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.active !== undefined && { active: data.active }),
          ...(data.displayOrder !== undefined && { displayOrder: data.displayOrder }),
        },
      });
    },
    remove: async (prisma, id) => {
      await prisma.jobTitleType.delete({ where: { id } });
    },
    references: async (prisma, id) => [
      cuenta(await prisma.jobTitle.count({ where: { jobTitleTypeId: id } }), 'cargo', 'cargos'),
    ],
  },

  'job-titles': {
    list: (prisma) =>
      prisma.jobTitle.findMany({
        orderBy: { displayOrder: 'asc' },
        include: { jobTitleType: { select: { id: true, code: true, name: true } } },
      }),
    findById: (prisma, id) => prisma.jobTitle.findUnique({ where: { id } }),
    create: async (prisma, tenantId, body) => {
      const data = jobTitleSchema.parse(body);
      return prisma.jobTitle.create({
        data: {
          tenantId,
          code: data.code,
          name: data.name,
          active: data.active,
          displayOrder: data.displayOrder,
          jobTitleTypeId: data.jobTitleTypeId,
        },
      });
    },
    update: async (prisma, id, body) => {
      const data = jobTitleUpdateSchema.parse(body);
      return prisma.jobTitle.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.active !== undefined && { active: data.active }),
          ...(data.displayOrder !== undefined && { displayOrder: data.displayOrder }),
          ...(data.jobTitleTypeId !== undefined && { jobTitleTypeId: data.jobTitleTypeId }),
        },
      });
    },
    remove: async (prisma, id) => {
      await prisma.jobTitle.delete({ where: { id } });
    },
    references: async (prisma, id) => {
      const [users, activityJobTitles] = await Promise.all([
        prisma.user.count({ where: { jobTitleId: id } }),
        prisma.activityJobTitle.count({ where: { jobTitleId: id } }),
      ]);
      return [
        cuenta(users, 'persona', 'personas'),
        cuenta(activityJobTitles, 'formacion', 'formaciones'),
      ];
    },
  },

  services: {
    list: (prisma) => prisma.service.findMany({ orderBy: { displayOrder: 'asc' } }),
    findById: (prisma, id) => prisma.service.findUnique({ where: { id } }),
    create: async (prisma, tenantId, body) => {
      const data = serviceSchema.parse(body);
      return prisma.service.create({
        data: {
          tenantId,
          code: data.code,
          name: data.name,
          active: data.active,
          displayOrder: data.displayOrder,
        },
      });
    },
    update: async (prisma, id, body) => {
      const data = serviceUpdateSchema.parse(body);
      return prisma.service.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.active !== undefined && { active: data.active }),
          ...(data.displayOrder !== undefined && { displayOrder: data.displayOrder }),
        },
      });
    },
    remove: async (prisma, id) => {
      await prisma.service.delete({ where: { id } });
    },
    references: async (prisma, id) => [
      cuenta(await prisma.activityService.count({ where: { serviceId: id } }), 'formacion', 'formaciones'),
    ],
  },

  regionals: {
    list: (prisma) => prisma.regional.findMany({ orderBy: { displayOrder: 'asc' } }),
    findById: (prisma, id) => prisma.regional.findUnique({ where: { id } }),
    create: async (prisma, tenantId, body) => {
      const data = regionalSchema.parse(body);
      return prisma.regional.create({
        data: {
          tenantId,
          code: data.code,
          name: data.name,
          active: data.active,
          displayOrder: data.displayOrder,
        },
      });
    },
    update: async (prisma, id, body) => {
      const data = regionalUpdateSchema.parse(body);
      return prisma.regional.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.active !== undefined && { active: data.active }),
          ...(data.displayOrder !== undefined && { displayOrder: data.displayOrder }),
        },
      });
    },
    remove: async (prisma, id) => {
      await prisma.regional.delete({ where: { id } });
    },
    references: async (prisma, id) => {
      const [users, offerings, activityRegionals] = await Promise.all([
        prisma.user.count({ where: { regionalId: id } }),
        prisma.offering.count({ where: { regionalId: id } }),
        prisma.activityRegional.count({ where: { regionalId: id } }),
      ]);
      return [
        cuenta(users, 'persona', 'personas'),
        cuenta(offerings, 'convocatoria', 'convocatorias'),
        cuenta(activityRegionals, 'formacion', 'formaciones'),
      ];
    },
  },

  norms: {
    list: (prisma) => prisma.norm.findMany({ orderBy: { displayOrder: 'asc' } }),
    findById: (prisma, id) => prisma.norm.findUnique({ where: { id } }),
    create: async (prisma, tenantId, body) => {
      const data = normSchema.parse(body);
      return prisma.norm.create({
        data: {
          tenantId,
          code: data.code,
          name: data.name,
          active: data.active,
          displayOrder: data.displayOrder,
          annualHoursRequired: data.annualHoursRequired ?? null,
        },
      });
    },
    update: async (prisma, id, body) => {
      const data = normUpdateSchema.parse(body);
      return prisma.norm.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.active !== undefined && { active: data.active }),
          ...(data.displayOrder !== undefined && { displayOrder: data.displayOrder }),
          ...(data.annualHoursRequired !== undefined && { annualHoursRequired: data.annualHoursRequired }),
        },
      });
    },
    remove: async (prisma, id) => {
      await prisma.norm.delete({ where: { id } });
    },
    references: async (prisma, id) => [
      cuenta(await prisma.activityNorm.count({ where: { normId: id } }), 'formacion', 'formaciones'),
    ],
  },

  'activity-types': {
    list: (prisma) => prisma.activityType.findMany({ orderBy: { displayOrder: 'asc' } }),
    findById: (prisma, id) => prisma.activityType.findUnique({ where: { id } }),
    create: async (prisma, tenantId, body) => {
      const data = activityTypeSchema.parse(body);
      return prisma.activityType.create({
        data: {
          tenantId,
          code: data.code,
          name: data.name,
          active: data.active,
          displayOrder: data.displayOrder,
          icon: data.icon ?? null,
          colorHex: data.colorHex ?? null,
          config: data.config as Prisma.InputJsonValue,
        },
      });
    },
    update: async (prisma, id, body) => {
      const data = activityTypeUpdateSchema.parse(body);
      return prisma.activityType.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.active !== undefined && { active: data.active }),
          ...(data.displayOrder !== undefined && { displayOrder: data.displayOrder }),
          ...(data.icon !== undefined && { icon: data.icon }),
          ...(data.colorHex !== undefined && { colorHex: data.colorHex }),
          ...(data.config !== undefined && { config: data.config as Prisma.InputJsonValue }),
        },
      });
    },
    remove: async (prisma, id) => {
      await prisma.activityType.delete({ where: { id } });
    },
    references: async (prisma, id) => [
      cuenta(await prisma.activity.count({ where: { activityTypeId: id } }), 'formacion', 'formaciones'),
    ],
    isSystemProtected: (record) => record.isSystem === true,
  },
};

@Injectable()
export class CatalogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(catalog: string): Promise<CatalogRecord[]> {
    const key = this.assertCatalogKey(catalog);
    return CATALOG_DESCRIPTORS[key].list(this.prisma.scoped);
  }

  async create(catalog: string, body: unknown, user: AuthUser): Promise<CatalogRecord> {
    const key = this.assertCatalogKey(catalog);
    const descriptor = CATALOG_DESCRIPTORS[key];
    const tenantId = this.prisma.currentTenantId;

    let created: CatalogRecord;
    try {
      created = await descriptor.create(this.prisma.scoped, tenantId, body);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) throw new ConflictException({ code: 'DUPLICATE_CODE' });
      throw error;
    }

    await this.audit.record({
      tenantId,
      userId: user.id,
      action: 'CATALOG_CREATED',
      resourceType: key,
      resourceId: String(created.id),
      newValues: created,
    });
    return created;
  }

  async update(catalog: string, id: string, body: unknown, user: AuthUser): Promise<CatalogRecord> {
    const key = this.assertCatalogKey(catalog);
    const descriptor = CATALOG_DESCRIPTORS[key];
    const prisma = this.prisma.scoped;

    const existing = await descriptor.findById(prisma, id);
    if (!existing) throw new NotFoundException({ code: 'CATALOG_NOT_FOUND' });

    let updated: CatalogRecord;
    try {
      updated = await descriptor.update(prisma, id, body);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) throw new ConflictException({ code: 'DUPLICATE_CODE' });
      throw error;
    }

    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: user.id,
      action: 'CATALOG_UPDATED',
      resourceType: key,
      resourceId: id,
      oldValues: existing,
      newValues: updated,
    });
    return updated;
  }

  async remove(catalog: string, id: string, user: AuthUser): Promise<{ ok: true }> {
    const key = this.assertCatalogKey(catalog);
    const descriptor = CATALOG_DESCRIPTORS[key];
    const prisma = this.prisma.scoped;

    const existing = await descriptor.findById(prisma, id);
    if (!existing) throw new NotFoundException({ code: 'CATALOG_NOT_FOUND' });

    if (descriptor.isSystemProtected?.(existing)) {
      throw new ForbiddenException({ code: 'SYSTEM_CATALOG' });
    }

    /*
      EL "NO SE PUEDE" VIAJA CON SU MOTIVO.

      La regla no cambia —lo que otros usan no se borra, se desactiva— pero un 409 pelado obliga a
      quien administra a adivinar que estorba. Van el total y el desglose para que la pantalla pueda
      decir "3 formaciones lo usan" y ofrecer la salida que si existe.
    */
    const usedBy = (await descriptor.references(prisma, id)).filter((r) => r.count > 0);
    const references = usedBy.reduce((suma, r) => suma + r.count, 0);
    if (references > 0) {
      throw new ConflictException({
        code: 'CATALOG_IN_USE',
        references,
        usedBy: usedBy.map((r) => ({ count: r.count, label: r.count === 1 ? r.one : r.many })),
        hint: 'Desactivelo en su lugar',
      });
    }

    await descriptor.remove(prisma, id);
    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: user.id,
      action: 'CATALOG_DELETED',
      resourceType: key,
      resourceId: id,
      oldValues: existing,
    });
    return { ok: true };
  }

  private assertCatalogKey(catalog: string): CatalogKey {
    if (!(CATALOG_KEYS as readonly string[]).includes(catalog)) {
      throw new NotFoundException({ code: 'UNKNOWN_CATALOG' });
    }
    return catalog as CatalogKey;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
