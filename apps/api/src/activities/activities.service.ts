import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateActivityInput,
  CreateContentInput,
  ListActivitiesQuery,
  UpdateActivityInput,
  UpdateContentInput,
} from '@neo-pulse/shared';
import { AuditService } from '../common/audit.service.js';
import type { AuthUser } from '../common/types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { VersioningService } from './versioning.service.js';

const ACTIVITY_LIST_SELECT = {
  id: true,
  code: true,
  name: true,
  modality: true,
  active: true,
  updatedAt: true,
  activityType: { select: { id: true, code: true, name: true, colorHex: true } },
  process: { select: { id: true, code: true, name: true } },
  currentVersionId: true,
  versions: {
    select: { id: true, versionNumber: true, status: true, publishedAt: true },
    orderBy: { versionNumber: 'desc' as const },
  },
} satisfies Prisma.ActivitySelect;

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly versioning: VersioningService,
  ) {}

  async list(query: ListActivitiesQuery) {
    const where: Prisma.ActivityWhereInput = {
      deletedAt: null,
      ...(query.active ? { active: query.active === 'true' } : {}),
      ...(query.activityTypeId ? { activityTypeId: query.activityTypeId } : {}),
      ...(query.processId ? { processId: query.processId } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { code: { contains: query.q.toUpperCase() } },
            ],
          }
        : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.scoped.activity.count({ where }),
      this.prisma.scoped.activity.findMany({
        where,
        select: ACTIVITY_LIST_SELECT,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { total, page: query.page, pageSize: query.pageSize, items };
  }

  async getById(id: string) {
    const activity = await this.prisma.scoped.activity.findFirst({
      where: { id, deletedAt: null },
      include: {
        activityType: { select: { id: true, code: true, name: true, colorHex: true, config: true } },
        process: { select: { id: true, code: true, name: true } },
        norms: { select: { norm: { select: { id: true, code: true, name: true } } } },
        services: { select: { service: { select: { id: true, code: true, name: true } } } },
        regionals: { select: { regional: { select: { id: true, code: true, name: true } } } },
        jobTitles: { select: { jobTitle: { select: { id: true, code: true, name: true } } } },
        versions: {
          orderBy: { versionNumber: 'desc' },
          select: {
            id: true,
            versionNumber: true,
            status: true,
            publishedAt: true,
            passingScore: true,
            maxAttempts: true,
            estimatedMinutes: true,
            _count: { select: { contents: true } },
          },
        },
      },
    });
    if (!activity) throw new NotFoundException({ code: 'ACTIVITY_NOT_FOUND' });
    return {
      ...activity,
      norms: activity.norms.map((n) => n.norm),
      services: activity.services.map((s) => s.service),
      regionals: activity.regionals.map((r) => r.regional),
      jobTitles: activity.jobTitles.map((j) => j.jobTitle),
    };
  }

  /** Crea la actividad y su version 1 en borrador, en una sola transaccion. */
  async create(actor: AuthUser, input: CreateActivityInput) {
    const tenantId = this.prisma.currentTenantId;

    const activity = await this.prisma
      .tx(async (tx) => {
        const created = await tx.activity.create({
          data: {
            tenantId,
            code: input.code,
            name: input.name,
            description: input.description ?? null,
            activityTypeId: input.activityTypeId,
            processId: input.processId,
            responsibleUserId: input.responsibleUserId ?? null,
            modality: input.modality,
            tags: input.tags,
            createdBy: actor.id,
            updatedBy: actor.id,
          },
        });
        await this.replaceScope(tx, tenantId, created.id, input);
        await this.versioning.createInitialDraft(tx, tenantId, created.id);
        return created;
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException({ code: 'DUPLICATE_CODE' });
        }
        throw error;
      });

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'ACTIVITY_CREATED',
      resourceType: 'activities',
      resourceId: activity.id,
      newValues: { code: input.code, name: input.name },
    });
    return this.getById(activity.id);
  }

  /** Datos de cabecera de la actividad (nombre, alcance). No toca versiones ni contenido. */
  async update(actor: AuthUser, id: string, input: UpdateActivityInput) {
    const tenantId = this.prisma.currentTenantId;
    const before = await this.prisma.scoped.activity.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException({ code: 'ACTIVITY_NOT_FOUND' });

    await this.prisma.tx(async (tx) => {
      await tx.activity.update({
        where: { id },
        data: {
          name: input.name,
          description: input.description,
          activityTypeId: input.activityTypeId,
          processId: input.processId,
          responsibleUserId: input.responsibleUserId,
          modality: input.modality,
          tags: input.tags,
          active: input.active,
          updatedBy: actor.id,
        },
      });
      await this.replaceScope(tx, tenantId, id, input);
    });

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'ACTIVITY_UPDATED',
      resourceType: 'activities',
      resourceId: id,
      oldValues: { name: before.name, modality: before.modality, active: before.active },
      newValues: input,
    });
    return this.getById(id);
  }

  /** Baja logica: el historico formativo debe sobrevivir (retencion 20 anos, Decision #16). */
  async softDelete(actor: AuthUser, id: string) {
    const activity = await this.prisma.scoped.activity.findFirst({ where: { id, deletedAt: null } });
    if (!activity) throw new NotFoundException({ code: 'ACTIVITY_NOT_FOUND' });

    const offerings = await this.prisma.scoped.offering.count({
      where: { activityVersion: { activityId: id } },
    });
    if (offerings > 0) {
      throw new ConflictException({
        code: 'ACTIVITY_IN_USE',
        message: 'La actividad tiene convocatorias. Desactivala en lugar de eliminarla.',
      });
    }

    await this.prisma.scoped.activity.update({
      where: { id },
      data: { deletedAt: new Date(), active: false, updatedBy: actor.id },
    });
    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: 'ACTIVITY_DELETED',
      resourceType: 'activities',
      resourceId: id,
      oldValues: { code: activity.code, name: activity.name },
    });
    return { ok: true as const };
  }

  // ─────────────────────── Contenidos de la version en borrador ───────────────────────

  async addContent(actor: AuthUser, versionId: string, input: CreateContentInput) {
    const tenantId = this.prisma.currentTenantId;
    await this.versioning.assertDraft(versionId);

    const last = await this.prisma.scoped.activityContent.findFirst({
      where: { activityVersionId: versionId },
      orderBy: { displayOrder: 'desc' },
      select: { displayOrder: true },
    });

    const content = await this.prisma.scoped.activityContent.create({
      data: {
        tenantId,
        activityVersionId: versionId,
        type: input.type,
        title: input.title,
        displayOrder: (last?.displayOrder ?? -1) + 1,
        isRequired: input.isRequired,
        config: input.config as Prisma.InputJsonValue,
        lessonId: input.lessonId ?? null,
        contentPackageId: input.contentPackageId ?? null,
        assessmentVersionId: input.assessmentVersionId ?? null,
        surveyTemplateId: input.surveyTemplateId ?? null,
      },
    });
    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'CONTENT_ADDED',
      resourceType: 'activity_contents',
      resourceId: content.id,
      newValues: { versionId, type: input.type, title: input.title },
    });
    return content;
  }

  async updateContent(actor: AuthUser, contentId: string, input: UpdateContentInput) {
    const content = await this.prisma.scoped.activityContent.findUnique({ where: { id: contentId } });
    if (!content) throw new NotFoundException({ code: 'CONTENT_NOT_FOUND' });
    await this.versioning.assertDraft(content.activityVersionId);

    const updated = await this.prisma.scoped.activityContent.update({
      where: { id: contentId },
      data: {
        title: input.title,
        isRequired: input.isRequired,
        config: input.config as Prisma.InputJsonValue | undefined,
        lessonId: input.lessonId,
        contentPackageId: input.contentPackageId,
        assessmentVersionId: input.assessmentVersionId,
        surveyTemplateId: input.surveyTemplateId,
      },
    });
    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: 'CONTENT_UPDATED',
      resourceType: 'activity_contents',
      resourceId: contentId,
      oldValues: { title: content.title },
      newValues: input,
    });
    return updated;
  }

  async removeContent(actor: AuthUser, contentId: string) {
    const content = await this.prisma.scoped.activityContent.findUnique({ where: { id: contentId } });
    if (!content) throw new NotFoundException({ code: 'CONTENT_NOT_FOUND' });
    await this.versioning.assertDraft(content.activityVersionId);

    await this.prisma.tx(async (tx) => {
      await tx.activityContent.delete({ where: { id: contentId } });
      // Renumerar para que el orden no quede con huecos.
      const rest = await tx.activityContent.findMany({
        where: { activityVersionId: content.activityVersionId },
        orderBy: { displayOrder: 'asc' },
        select: { id: true },
      });
      for (const [index, item] of rest.entries()) {
        await tx.activityContent.update({ where: { id: item.id }, data: { displayOrder: index } });
      }
    });
    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: 'CONTENT_REMOVED',
      resourceType: 'activity_contents',
      resourceId: contentId,
      oldValues: { title: content.title, type: content.type },
    });
    return { ok: true as const };
  }

  async reorderContents(actor: AuthUser, versionId: string, orderedIds: string[]) {
    await this.versioning.assertDraft(versionId);
    const current = await this.prisma.scoped.activityContent.findMany({
      where: { activityVersionId: versionId },
      select: { id: true },
    });
    const currentIds = new Set(current.map((c) => c.id));
    const sameSize = currentIds.size === orderedIds.length;
    const allBelong = orderedIds.every((id) => currentIds.has(id));
    if (!sameSize || !allBelong) {
      throw new ConflictException({
        code: 'REORDER_MISMATCH',
        message: 'La lista debe contener exactamente los contenidos de esta version.',
      });
    }

    await this.prisma.tx(async (tx) => {
      for (const [index, id] of orderedIds.entries()) {
        await tx.activityContent.update({ where: { id }, data: { displayOrder: index } });
      }
    });
    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: 'CONTENTS_REORDERED',
      resourceType: 'activity_versions',
      resourceId: versionId,
      newValues: { orderedIds },
    });
    return { ok: true as const };
  }

  /** Reemplaza las relaciones N:M de alcance solo cuando el input las trae. */
  private async replaceScope(
    tx: Prisma.TransactionClient,
    tenantId: string,
    activityId: string,
    input: Partial<Pick<CreateActivityInput, 'normIds' | 'serviceIds' | 'regionalIds' | 'jobTitleIds'>>,
  ): Promise<void> {
    if (input.normIds) {
      await tx.activityNorm.deleteMany({ where: { activityId } });
      if (input.normIds.length > 0) {
        await tx.activityNorm.createMany({ data: input.normIds.map((normId) => ({ tenantId, activityId, normId })) });
      }
    }
    if (input.serviceIds) {
      await tx.activityService.deleteMany({ where: { activityId } });
      if (input.serviceIds.length > 0) {
        await tx.activityService.createMany({
          data: input.serviceIds.map((serviceId) => ({ tenantId, activityId, serviceId })),
        });
      }
    }
    if (input.regionalIds) {
      await tx.activityRegional.deleteMany({ where: { activityId } });
      if (input.regionalIds.length > 0) {
        await tx.activityRegional.createMany({
          data: input.regionalIds.map((regionalId) => ({ tenantId, activityId, regionalId })),
        });
      }
    }
    if (input.jobTitleIds) {
      await tx.activityJobTitle.deleteMany({ where: { activityId } });
      if (input.jobTitleIds.length > 0) {
        await tx.activityJobTitle.createMany({
          data: input.jobTitleIds.map((jobTitleId) => ({ tenantId, activityId, jobTitleId })),
        });
      }
    }
  }
}
