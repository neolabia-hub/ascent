import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CardType, Prisma } from '@prisma/client';
import type { CardPayload, CreateLessonInput, SaveCardsInput } from '@neo-pulse/shared';
import { AuditService } from '../common/audit.service.js';
import type { AuthUser } from '../common/types.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * LECCIONES EN TARJETAS (Decision #20): la unidad de contenido del producto.
 *
 * Una leccion PUBLISHED es una copia congelada creada al publicar una version de actividad
 * (ver versioning.service.cloneLesson): es INMUTABLE, porque es exactamente lo que vio quien
 * ya curso esa version. Toda edicion ocurre sobre lecciones DRAFT.
 */
@Injectable()
export class LessonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(status?: 'DRAFT' | 'PUBLISHED') {
    return this.prisma.scoped.lesson.findMany({
      where: status ? { status } : {},
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        estimatedMinutes: true,
        status: true,
        updatedAt: true,
        _count: { select: { cards: true } },
      },
    });
  }

  async getById(id: string) {
    const lesson = await this.prisma.scoped.lesson.findUnique({
      where: { id },
      include: { cards: { orderBy: { displayOrder: 'asc' } } },
    });
    if (!lesson) throw new NotFoundException({ code: 'LESSON_NOT_FOUND' });
    return lesson;
  }

  async create(actor: AuthUser, input: CreateLessonInput) {
    const lesson = await this.prisma.scoped.lesson.create({
      data: {
        tenantId: this.prisma.currentTenantId,
        title: input.title,
        estimatedMinutes: input.estimatedMinutes ?? null,
        status: 'DRAFT',
        createdBy: actor.id,
      },
    });
    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: 'LESSON_CREATED',
      resourceType: 'lessons',
      resourceId: lesson.id,
      newValues: { title: input.title },
    });
    return lesson;
  }

  async update(actor: AuthUser, id: string, input: Partial<CreateLessonInput>) {
    const lesson = await this.assertEditable(id);
    const updated = await this.prisma.scoped.lesson.update({
      where: { id },
      data: { title: input.title, estimatedMinutes: input.estimatedMinutes },
    });
    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: 'LESSON_UPDATED',
      resourceType: 'lessons',
      resourceId: id,
      oldValues: { title: lesson.title },
      newValues: input,
    });
    return updated;
  }

  /**
   * Guarda la pila COMPLETA de tarjetas (el editor manda la leccion entera): borra las que ya
   * no vienen, actualiza las existentes y crea las nuevas, dejando el orden del arreglo.
   */
  async saveCards(actor: AuthUser, id: string, input: SaveCardsInput) {
    const tenantId = this.prisma.currentTenantId;
    await this.assertEditable(id);

    const keptIds = input.cards.map((card) => card.id).filter((cardId): cardId is string => Boolean(cardId));

    await this.prisma.tx(async (tx) => {
      await tx.lessonCard.deleteMany({
        where: { lessonId: id, ...(keptIds.length > 0 ? { id: { notIn: keptIds } } : {}) },
      });

      for (const [index, card] of input.cards.entries()) {
        const data = {
          cardType: card.payload.cardType as CardType,
          displayOrder: index,
          payload: card.payload as unknown as Prisma.InputJsonValue,
          mediaKey: this.mediaKeyOf(card.payload),
        };
        if (card.id) {
          await tx.lessonCard.update({ where: { id: card.id }, data });
        } else {
          await tx.lessonCard.create({ data: { tenantId, lessonId: id, ...data } });
        }
      }
    });

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'LESSON_CARDS_SAVED',
      resourceType: 'lessons',
      resourceId: id,
      newValues: { cardCount: input.cards.length },
    });
    return this.getById(id);
  }

  async remove(actor: AuthUser, id: string) {
    const lesson = await this.assertEditable(id);
    const used = await this.prisma.scoped.activityContent.count({ where: { lessonId: id } });
    if (used > 0) {
      throw new ConflictException({
        code: 'LESSON_IN_USE',
        message: 'La leccion esta usada en una actividad. Quitala de la actividad primero.',
      });
    }
    await this.prisma.tx(async (tx) => {
      await tx.lessonCard.deleteMany({ where: { lessonId: id } });
      await tx.lesson.delete({ where: { id } });
    });
    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: 'LESSON_DELETED',
      resourceType: 'lessons',
      resourceId: id,
      oldValues: { title: lesson.title },
    });
    return { ok: true as const };
  }

  /** Copia editable de una leccion (util para partir de una publicada sin tocarla). */
  async duplicate(actor: AuthUser, id: string) {
    const tenantId = this.prisma.currentTenantId;
    const source = await this.getById(id);

    const clone = await this.prisma.tx(async (tx) => {
      const created = await tx.lesson.create({
        data: {
          tenantId,
          title: `${source.title} (copia)`.slice(0, 200),
          estimatedMinutes: source.estimatedMinutes,
          status: 'DRAFT',
          createdBy: actor.id,
        },
      });
      if (source.cards.length > 0) {
        await tx.lessonCard.createMany({
          data: source.cards.map((card) => ({
            tenantId,
            lessonId: created.id,
            cardType: card.cardType,
            displayOrder: card.displayOrder,
            payload: card.payload as Prisma.InputJsonValue,
            mediaKey: card.mediaKey,
          })),
        });
      }
      return created;
    });

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'LESSON_DUPLICATED',
      resourceType: 'lessons',
      resourceId: clone.id,
      newValues: { fromLessonId: id },
    });
    return this.getById(clone.id);
  }

  /** Protege la inmutabilidad de lo publicado. */
  private async assertEditable(id: string) {
    const lesson = await this.prisma.scoped.lesson.findUnique({ where: { id } });
    if (!lesson) throw new NotFoundException({ code: 'LESSON_NOT_FOUND' });
    if (lesson.status === 'PUBLISHED') {
      throw new ConflictException({
        code: 'LESSON_NOT_EDITABLE',
        message: 'Esta leccion pertenece a una version publicada y es inmutable. Duplicala para editarla.',
      });
    }
    return lesson;
  }

  /** Solo dos tipos de tarjeta llevan medio asociado. */
  private mediaKeyOf(payload: CardPayload): string | null {
    if (payload.cardType === 'TEXT_IMAGE' || payload.cardType === 'VIDEO_SHORT') {
      return payload.mediaKey ?? null;
    }
    return null;
  }
}
