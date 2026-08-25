import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { tenantSettingsSchema, type PublishVersionInput, type UpdateVersionSettingsInput } from '@neo-pulse/shared';
import { AuditService } from '../common/audit.service.js';
import type { AuthUser } from '../common/types.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * MOTOR DE VERSIONADO (Decision #6 — la regla de oro 4 del modelo).
 *
 * Invariantes que este servicio garantiza:
 *  1. Una actividad tiene como maximo UNA version en borrador a la vez.
 *  2. Publicar CONGELA la version: pasa a PUBLISHED, copia por valor los ajustes academicos
 *     resueltos en cascada (tenant -> actividad) y clona en profundidad el contenido editable
 *     (lecciones) para que nadie pueda alterar despues lo que una persona ya curso.
 *  3. Editar lo publicado NO modifica nada: crea la version N+1 en borrador copiando la
 *     publicada, con copias EDITABLES de las lecciones.
 *  4. Los completados quedan intactos siempre; la politica de migracion solo decide que pasa
 *     con quienes van a mitad o no han empezado.
 *
 * Sin esto, la pregunta de auditoria "que examen presento esta persona en marzo" no tiene
 * respuesta, y cambiar la nota minima reprobaria retroactivamente a gente ya aprobada.
 */
@Injectable()
export class VersioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Version en borrador de una actividad (si existe). */
  async findDraft(activityId: string) {
    return this.prisma.scoped.activityVersion.findFirst({
      where: { activityId, status: 'DRAFT' },
      include: { contents: { orderBy: { displayOrder: 'asc' } } },
    });
  }

  async getVersion(versionId: string) {
    const version = await this.prisma.scoped.activityVersion.findUnique({
      where: { id: versionId },
      include: {
        contents: {
          orderBy: { displayOrder: 'asc' },
          include: {
            lesson: { select: { id: true, title: true, estimatedMinutes: true, status: true, _count: { select: { cards: true } } } },
            contentPackage: { select: { id: true, kind: true, originalName: true, sizeBytes: true, storageKey: true } },
            assessmentVersion: {
              select: {
                id: true,
                versionNumber: true,
                status: true,
                passingScore: true,
                maxAttempts: true,
                assessment: { select: { id: true, title: true } },
                _count: { select: { sections: true } },
              },
            },
          },
        },
      },
    });
    if (!version) throw new NotFoundException({ code: 'VERSION_NOT_FOUND' });
    return version;
  }

  /**
   * Crea la version 1 en borrador. Se llama al crear la actividad; los ajustes academicos
   * arrancan con el default del tenant y quedan editables hasta publicar.
   */
  async createInitialDraft(tx: Prisma.TransactionClient, tenantId: string, activityId: string) {
    const defaults = await this.tenantDefaults(tx, tenantId);
    return tx.activityVersion.create({
      data: {
        tenantId,
        activityId,
        versionNumber: 1,
        status: 'DRAFT',
        passingScore: defaults.passingScore,
        maxAttempts: defaults.maxAttempts,
        retryWaitHours: defaults.retryWaitHours,
      },
    });
  }

  /** Ajustes academicos del borrador (solo mientras esta en borrador). */
  async updateDraftSettings(actor: AuthUser, versionId: string, input: UpdateVersionSettingsInput) {
    const version = await this.assertDraft(versionId);
    const updated = await this.prisma.scoped.activityVersion.update({
      where: { id: version.id },
      data: {
        passingScore: input.passingScore,
        maxAttempts: input.maxAttempts,
        retryWaitHours: input.retryWaitHours,
        estimatedMinutes: input.estimatedMinutes,
      },
    });
    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: 'VERSION_SETTINGS_UPDATED',
      resourceType: 'activity_versions',
      resourceId: versionId,
      oldValues: { passingScore: version.passingScore, maxAttempts: version.maxAttempts },
      newValues: input,
    });
    return updated;
  }

  /**
   * PUBLICA el borrador. Operacion irreversible y transaccional:
   *  - clona las lecciones referenciadas (copias PUBLISHED e inmutables),
   *  - publica las versiones de evaluacion en borrador que use,
   *  - congela el temario (para constancias) y los ajustes academicos,
   *  - retira la version publicada anterior y apunta la actividad a la nueva.
   */
  async publish(actor: AuthUser, versionId: string, input: PublishVersionInput) {
    const tenantId = this.prisma.currentTenantId;
    const draft = await this.assertDraft(versionId);

    const contents = await this.prisma.scoped.activityContent.findMany({
      where: { activityVersionId: draft.id },
      orderBy: { displayOrder: 'asc' },
    });
    if (contents.length === 0) {
      throw new BadRequestException({ code: 'VERSION_EMPTY', message: 'La version necesita al menos un contenido.' });
    }
    const incomplete = contents.filter((c) => !this.isContentComplete(c));
    if (incomplete.length > 0) {
      throw new BadRequestException({
        code: 'CONTENT_INCOMPLETE',
        message: 'Hay contenidos sin material asignado.',
        items: incomplete.map((c) => ({ id: c.id, title: c.title, type: c.type })),
      });
    }

    const published = await this.prisma.tx(async (tx) => {
      // 1. Congelar el contenido editable: la version publicada apunta a copias inmutables.
      for (const content of contents) {
        if (content.type === 'LESSON' && content.lessonId) {
          const frozenLessonId = await this.cloneLesson(tx, tenantId, content.lessonId, 'PUBLISHED');
          await tx.activityContent.update({ where: { id: content.id }, data: { lessonId: frozenLessonId } });
        }
        if (content.type === 'ASSESSMENT' && content.assessmentVersionId) {
          await tx.assessmentVersion.updateMany({
            where: { id: content.assessmentVersionId, status: 'DRAFT' },
            data: { status: 'PUBLISHED' },
          });
        }
      }

      // 2. Temario por VALOR para las constancias (renombrar la actividad no altera el historico).
      const frozenContents = await tx.activityContent.findMany({
        where: { activityVersionId: draft.id },
        orderBy: { displayOrder: 'asc' },
        include: { lesson: { select: { title: true, estimatedMinutes: true } } },
      });
      const syllabus = {
        publishedAt: new Date().toISOString(),
        items: frozenContents.map((c) => ({
          order: c.displayOrder,
          type: c.type,
          title: c.title,
          isRequired: c.isRequired,
          estimatedMinutes: c.lesson?.estimatedMinutes ?? null,
        })),
      };

      // 3. Publicar y retirar la anterior.
      const previous = await tx.activityVersion.findFirst({
        where: { activityId: draft.activityId, status: 'PUBLISHED' },
      });
      if (previous) {
        await tx.activityVersion.update({ where: { id: previous.id }, data: { status: 'RETIRED' } });
      }
      const result = await tx.activityVersion.update({
        where: { id: draft.id },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          publishedBy: actor.id,
          migrationPolicy: input.migrationPolicy,
          syllabusSnapshot: syllabus,
        },
      });
      await tx.activity.update({ where: { id: draft.activityId }, data: { currentVersionId: result.id } });
      return { result, previousId: previous?.id ?? null };
    });

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'VERSION_PUBLISHED',
      resourceType: 'activity_versions',
      resourceId: versionId,
      newValues: {
        versionNumber: draft.versionNumber,
        migrationPolicy: input.migrationPolicy,
        retiredVersionId: published.previousId,
      },
    });
    return published.result;
  }

  /**
   * Crea la version N+1 en BORRADOR a partir de la publicada (copy-on-edit). La publicada NO
   * se toca: sigue siendo lo que vieron quienes ya la cursaron.
   */
  async createNextDraft(actor: AuthUser, activityId: string) {
    const tenantId = this.prisma.currentTenantId;

    const existingDraft = await this.prisma.scoped.activityVersion.findFirst({
      where: { activityId, status: 'DRAFT' },
      select: { id: true, versionNumber: true },
    });
    if (existingDraft) {
      throw new ConflictException({
        code: 'DRAFT_ALREADY_EXISTS',
        message: 'Ya hay una version en borrador. Editala o descartala antes de crear otra.',
        versionId: existingDraft.id,
        versionNumber: existingDraft.versionNumber,
      });
    }

    const source = await this.prisma.scoped.activityVersion.findFirst({
      where: { activityId, status: 'PUBLISHED' },
      include: { contents: { orderBy: { displayOrder: 'asc' } } },
    });
    if (!source) throw new NotFoundException({ code: 'NO_PUBLISHED_VERSION' });

    const last = await this.prisma.scoped.activityVersion.findFirst({
      where: { activityId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });

    const draft = await this.prisma.tx(async (tx) => {
      const created = await tx.activityVersion.create({
        data: {
          tenantId,
          activityId,
          versionNumber: (last?.versionNumber ?? source.versionNumber) + 1,
          status: 'DRAFT',
          passingScore: source.passingScore,
          maxAttempts: source.maxAttempts,
          retryWaitHours: source.retryWaitHours,
          estimatedMinutes: source.estimatedMinutes,
          migrationPolicy: source.migrationPolicy,
        },
      });

      for (const content of source.contents) {
        // Las lecciones de la version publicada son inmutables: se clonan como EDITABLES.
        const lessonId =
          content.type === 'LESSON' && content.lessonId
            ? await this.cloneLesson(tx, tenantId, content.lessonId, 'DRAFT')
            : content.lessonId;

        await tx.activityContent.create({
          data: {
            tenantId,
            activityVersionId: created.id,
            type: content.type,
            title: content.title,
            displayOrder: content.displayOrder,
            isRequired: content.isRequired,
            config: content.config as Prisma.InputJsonValue,
            lessonId,
            contentPackageId: content.contentPackageId, // los paquetes ya son inmutables
            assessmentVersionId: content.assessmentVersionId,
            surveyTemplateId: content.surveyTemplateId,
          },
        });
      }
      return created;
    });

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'VERSION_DRAFT_CREATED',
      resourceType: 'activity_versions',
      resourceId: draft.id,
      newValues: { fromVersionId: source.id, versionNumber: draft.versionNumber },
    });
    return draft;
  }

  /** Descarta un borrador (nunca una version publicada). */
  async discardDraft(actor: AuthUser, versionId: string) {
    const draft = await this.assertDraft(versionId);
    const count = await this.prisma.scoped.activityVersion.count({ where: { activityId: draft.activityId } });
    if (count === 1) {
      throw new ConflictException({
        code: 'LAST_VERSION',
        message: 'No se puede descartar la unica version. Elimina o desactiva la actividad.',
      });
    }
    await this.prisma.tx(async (tx) => {
      await tx.activityContent.deleteMany({ where: { activityVersionId: draft.id } });
      await tx.activityVersion.delete({ where: { id: draft.id } });
    });
    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: 'VERSION_DRAFT_DISCARDED',
      resourceType: 'activity_versions',
      resourceId: versionId,
      oldValues: { versionNumber: draft.versionNumber },
    });
    return { ok: true as const };
  }

  /** Lanza si la version no existe o no esta en borrador (protege la inmutabilidad). */
  async assertDraft(versionId: string) {
    const version = await this.prisma.scoped.activityVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new NotFoundException({ code: 'VERSION_NOT_FOUND' });
    if (version.status !== 'DRAFT') {
      throw new ConflictException({
        code: 'VERSION_NOT_EDITABLE',
        message: 'Esta version esta publicada y no se puede modificar. Crea una version nueva.',
        status: version.status,
      });
    }
    return version;
  }

  /** Copia profunda de una leccion (con sus tarjetas) en el estado pedido. */
  private async cloneLesson(
    tx: Prisma.TransactionClient,
    tenantId: string,
    lessonId: string,
    status: 'DRAFT' | 'PUBLISHED',
  ): Promise<string> {
    const source = await tx.lesson.findUniqueOrThrow({
      where: { id: lessonId },
      include: { cards: { orderBy: { displayOrder: 'asc' } } },
    });
    const clone = await tx.lesson.create({
      data: {
        tenantId,
        title: source.title,
        estimatedMinutes: source.estimatedMinutes,
        status,
        createdBy: source.createdBy,
      },
    });
    if (source.cards.length > 0) {
      await tx.lessonCard.createMany({
        data: source.cards.map((card) => ({
          tenantId,
          lessonId: clone.id,
          cardType: card.cardType,
          displayOrder: card.displayOrder,
          payload: card.payload as Prisma.InputJsonValue,
          mediaKey: card.mediaKey,
        })),
      });
    }
    return clone.id;
  }

  /** Un contenido esta completo cuando tiene asignado el material que su tipo exige. */
  private isContentComplete(content: {
    type: string;
    lessonId: string | null;
    contentPackageId: string | null;
    assessmentVersionId: string | null;
    surveyTemplateId: string | null;
    config: Prisma.JsonValue;
  }): boolean {
    const config = (content.config ?? {}) as { externalUrl?: string; href?: string };
    switch (content.type) {
      case 'LESSON':
        return Boolean(content.lessonId);
      case 'VIDEO':
        return Boolean(content.contentPackageId) || Boolean(config.externalUrl);
      case 'DOCUMENT':
      case 'SCORM':
        return Boolean(content.contentPackageId);
      case 'ASSESSMENT':
        return Boolean(content.assessmentVersionId);
      case 'SURVEY':
        return Boolean(content.surveyTemplateId);
      case 'LINK':
        return Boolean(config.href);
      default:
        return false;
    }
  }

  /** Defaults academicos del tenant (cascada nivel 1). */
  private async tenantDefaults(tx: Prisma.TransactionClient, tenantId: string) {
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { settings: true } });
    const settings = tenantSettingsSchema.parse(tenant.settings ?? {});
    return {
      passingScore: settings.passingScoreDefault,
      maxAttempts: settings.maxAttemptsDefault,
      retryWaitHours: settings.retryWaitHours,
    };
  }
}
