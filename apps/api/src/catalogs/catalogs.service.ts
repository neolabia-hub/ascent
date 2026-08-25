import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
  /** Cantidad de filas que referencian este registro (bloquea el borrado fisico si es > 0). */
  countReferences: (prisma: TenantPrisma, id: string) => Promise<number>;
  /** Solo activity-types: is_system=true no se puede borrar (catalogo protegido de fabrica). */
  isSystemProtected?: (record: CatalogRecord) => boolean;
}

const CATALOG_DESCRIPTORS: Record<CatalogKey, CatalogDescriptor> = {
  areas: {
    list: (prisma) => prisma.area.findMany({ orderBy: { displayOrder: 'asc' } }),
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
          managerUserId: data.managerUserId ?? null,
        },
      });
    },
    update: async (prisma, id, body) => {
      const data = areaUpdateSchema.parse(body);
      return prisma.area.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.active !== undefined && { active: data.active }),
          ...(data.displayOrder !== undefined && { displayOrder: data.displayOrder }),
          ...(data.parentId !== undefined && { parentId: data.parentId }),
          ...(data.managerUserId !== undefined && { managerUserId: data.managerUserId }),
        },
      });
    },
    remove: async (prisma, id) => {
      await prisma.area.delete({ where: { id } });
    },
    countReferences: async (prisma, id) => {
      const [users, processes, analystScopes] = await Promise.all([
        prisma.user.count({ where: { areaId: id } }),
        prisma.process.count({ where: { areaId: id } }),
        prisma.analystScope.count({ where: { areaId: id } }),
      ]);
      return users + processes + analystScopes;
    },
  },

  processes: {
    list: (prisma) => prisma.process.findMany({ orderBy: { displayOrder: 'asc' } }),
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
    countReferences: async (prisma, id) => {
      const [activities, analystScopes] = await Promise.all([
        prisma.activity.count({ where: { processId: id } }),
        prisma.analystScope.count({ where: { processId: id } }),
      ]);
      return activities + analystScopes;
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
    countReferences: async (prisma, id) => prisma.jobTitle.count({ where: { jobTitleTypeId: id } }),
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
    countReferences: async (prisma, id) => {
      const [users, activityJobTitles] = await Promise.all([
        prisma.user.count({ where: { jobTitleId: id } }),
        prisma.activityJobTitle.count({ where: { jobTitleId: id } }),
      ]);
      return users + activityJobTitles;
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
    countReferences: async (prisma, id) => prisma.activityService.count({ where: { serviceId: id } }),
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
    countReferences: async (prisma, id) => {
      const [users, offerings, activityRegionals] = await Promise.all([
        prisma.user.count({ where: { regionalId: id } }),
        prisma.offering.count({ where: { regionalId: id } }),
        prisma.activityRegional.count({ where: { regionalId: id } }),
      ]);
      return users + offerings + activityRegionals;
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
    countReferences: async (prisma, id) => prisma.activityNorm.count({ where: { normId: id } }),
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
    countReferences: async (prisma, id) => prisma.activity.count({ where: { activityTypeId: id } }),
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

    const references = await descriptor.countReferences(prisma, id);
    if (references > 0) {
      throw new ConflictException({ code: 'CATALOG_IN_USE', hint: 'Desactivelo en su lugar' });
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
