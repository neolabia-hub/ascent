import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, QuestionType } from '@prisma/client';
import type { CreateQuestionInput, QuestionPayload } from '@neo-pulse/shared';
import { AuditService } from '../common/audit.service.js';
import type { AuthUser } from '../common/types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { columnsToPayload, payloadToColumns } from './question-payload.js';

interface ListQuestionsParams {
  categoryId?: string;
  q?: string;
  qtype?: QuestionType;
  page: number;
  pageSize: number;
}

/**
 * BANCO DE PREGUNTAS con versionado inmutable (Decision #6).
 *
 * Editar una pregunta NO la modifica: crea la version N+1 y mueve el puntero `currentVersionId`.
 * Los intentos historicos siguen apuntando a la version que realmente se sirvio, asi que una
 * correccion de hoy jamas reescribe lo que alguien respondio el año pasado (y por eso, a
 * diferencia de Moodle, aqui nunca hay que "borrar los intentos" para poder corregir un enunciado).
 */
@Injectable()
export class QuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─────────────────────────── Categorias ───────────────────────────

  async listCategories() {
    const categories = await this.prisma.scoped.questionCategory.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, parentId: true, _count: { select: { questions: true } } },
    });
    return categories;
  }

  async createCategory(actor: AuthUser, name: string, parentId: string | null) {
    const category = await this.prisma.scoped.questionCategory.create({
      data: { tenantId: this.prisma.currentTenantId, name, parentId },
    });
    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: 'QUESTION_CATEGORY_CREATED',
      resourceType: 'question_categories',
      resourceId: category.id,
      newValues: { name, parentId },
    });
    return category;
  }

  /**
   * RENOMBRAR UN TEMA (2026-09-09).
   *
   * Se podia crear y borrar, y no cambiar de nombre — asi que un tema mal escrito el primer dia se
   * quedaba mal escrito para siempre, o habia que borrarlo (imposible: tiene preguntas) o crear otro
   * y mover las preguntas a mano. Lo cazo el cliente: *"las bibliotecas o banco o temas no se pueden
   * editar"*.
   *
   * El nombre no es evidencia de nada —es una etiqueta para agrupar preguntas— asi que renombrarlo
   * no reescribe historia: los intentos ya presentados guardan la pregunta con su enunciado, no el
   * nombre del tema. Queda en la auditoria con el nombre viejo y el nuevo, que es lo que hace falta
   * para explicar por que un informe de hace un año decia otra cosa.
   */
  async renameCategory(actor: AuthUser, id: string, name: string) {
    const antes = await this.prisma.scoped.questionCategory.findUnique({
      where: { id },
      select: { name: true },
    });
    if (!antes) throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND' });

    const category = await this.prisma.scoped.questionCategory.update({
      where: { id },
      data: { name },
      select: { id: true, name: true, parentId: true, _count: { select: { questions: true } } },
    });
    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: 'QUESTION_CATEGORY_RENAMED',
      resourceType: 'question_categories',
      resourceId: id,
      oldValues: { name: antes.name },
      newValues: { name },
    });
    return category;
  }

  async deleteCategory(actor: AuthUser, id: string) {
    const [questions, children] = await Promise.all([
      this.prisma.scoped.question.count({ where: { categoryId: id } }),
      this.prisma.scoped.questionCategory.count({ where: { parentId: id } }),
    ]);
    if (questions > 0 || children > 0) {
      throw new ConflictException({
        code: 'CATEGORY_IN_USE',
        message:
          questions > 0
            ? `Este tema tiene ${questions} pregunta(s) dentro. Quitales el tema o cambiaselo antes de borrarlo: borrarlo con preguntas dejaria los bloques al azar que lo usan sin de donde sacar.`
            : 'Este tema tiene subtemas dentro. Borra primero los subtemas.',
      });
    }
    await this.prisma.scoped.questionCategory.delete({ where: { id } });
    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: 'QUESTION_CATEGORY_DELETED',
      resourceType: 'question_categories',
      resourceId: id,
    });
    return { ok: true as const };
  }

  // ─────────────────────────── Preguntas ───────────────────────────

  async list(params: ListQuestionsParams) {
    const where: Prisma.QuestionWhereInput = {
      active: true,
      ...(params.categoryId ? { categoryId: params.categoryId } : {}),
      ...(params.q || params.qtype
        ? {
            versions: {
              some: {
                ...(params.qtype ? { qtype: params.qtype } : {}),
                ...(params.q ? { stem: { contains: params.q, mode: 'insensitive' } } : {}),
              },
            },
          }
        : {}),
    };

    const [total, questions] = await Promise.all([
      this.prisma.scoped.question.count({ where }),
      this.prisma.scoped.question.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: {
          id: true,
          categoryId: true,
          currentVersionId: true,
          createdAt: true,
          category: { select: { id: true, name: true } },
          versions: {
            orderBy: { versionNumber: 'desc' },
            take: 1,
            // Resumen para la lista: sin `correct`, no hace falta ahi.
            select: { id: true, versionNumber: true, qtype: true, stem: true, points: true },
          },
          _count: { select: { versions: true } },
        },
      }),
    ]);

    return {
      total,
      page: params.page,
      pageSize: params.pageSize,
      items: questions.map((question) => {
        const current = question.versions[0];
        return {
          id: question.id,
          categoryId: question.categoryId,
          categoryName: question.category?.name ?? null,
          versionCount: question._count.versions,
          currentVersionId: question.currentVersionId,
          qtype: current?.qtype ?? null,
          stem: current?.stem ?? '',
          points: current ? Number(current.points) : 0,
          versionNumber: current?.versionNumber ?? 0,
          createdAt: question.createdAt,
        };
      }),
    };
  }

  /** Detalle COMPLETO (incluye la respuesta correcta): solo para editar el banco. */
  async getForEdit(id: string) {
    const question = await this.prisma.scoped.question.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        versions: { orderBy: { versionNumber: 'desc' } },
      },
    });
    if (!question) throw new NotFoundException({ code: 'QUESTION_NOT_FOUND' });
    const current = question.versions.find((v) => v.id === question.currentVersionId) ?? question.versions[0];
    if (!current) throw new NotFoundException({ code: 'QUESTION_VERSION_NOT_FOUND' });

    return {
      id: question.id,
      categoryId: question.categoryId,
      categoryName: question.category?.name ?? null,
      currentVersionId: current.id,
      versionNumber: current.versionNumber,
      payload: columnsToPayload(current),
      history: question.versions.map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        createdAt: v.createdAt,
        isCurrent: v.id === question.currentVersionId,
      })),
    };
  }

  /**
    * EL TEMA ES OPCIONAL (Decision #84). Solo hace falta para los bloques al azar, que sacan N
    * preguntas de un tema. Exigirlo ponia una ceremonia delante de la primera pregunta del
    * producto: salirse a crear una "categoria" antes de poder escribir nada.
    */
  async create(actor: AuthUser, input: CreateQuestionInput) {
    const tenantId = this.prisma.currentTenantId;
    const categoryId = input.categoryId ?? null;
    if (categoryId) {
      const category = await this.prisma.scoped.questionCategory.findUnique({ where: { id: categoryId } });
      if (!category) throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND' });
    }

    const question = await this.prisma.tx(async (tx) => {
      const created = await tx.question.create({
        data: { tenantId, categoryId, active: true },
      });
      const version = await tx.questionVersion.create({
        data: {
          tenantId,
          questionId: created.id,
          versionNumber: 1,
          ...payloadToColumns(input.payload),
          createdBy: actor.id,
        },
      });
      return tx.question.update({ where: { id: created.id }, data: { currentVersionId: version.id } });
    });

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'QUESTION_CREATED',
      resourceType: 'questions',
      resourceId: question.id,
      newValues: { qtype: input.payload.qtype, categoryId },
    });
    return this.getForEdit(question.id);
  }

  /**
   * Revisar = crear la version N+1. La anterior queda intacta y sigue respaldando los intentos
   * que ya se sirvieron con ella.
   */
  async revise(actor: AuthUser, id: string, payload: QuestionPayload) {
    const tenantId = this.prisma.currentTenantId;
    const question = await this.prisma.scoped.question.findUnique({
      where: { id },
      select: { id: true, versions: { orderBy: { versionNumber: 'desc' }, take: 1, select: { versionNumber: true } } },
    });
    if (!question) throw new NotFoundException({ code: 'QUESTION_NOT_FOUND' });
    const lastNumber = question.versions[0]?.versionNumber ?? 0;

    await this.prisma.tx(async (tx) => {
      const version = await tx.questionVersion.create({
        data: {
          tenantId,
          questionId: id,
          versionNumber: lastNumber + 1,
          ...payloadToColumns(payload),
          createdBy: actor.id,
        },
      });
      await tx.question.update({ where: { id }, data: { currentVersionId: version.id } });
    });

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'QUESTION_REVISED',
      resourceType: 'questions',
      resourceId: id,
      newValues: { versionNumber: lastNumber + 1, qtype: payload.qtype },
    });
    return this.getForEdit(id);
  }

  /**
   * CAMBIAR EL TEMA no es cambiar la pregunta.
   *
   * Por eso NO crea una version: el enunciado, las opciones y la respuesta correcta siguen
   * siendo exactamente los que respondio quien la respondio. Lo unico que se mueve es de que
   * monton la sacan los bloques al azar, y eso es archivar, no revisar.
   */
  async setCategory(actor: AuthUser, id: string, categoryId: string | null) {
    const question = await this.prisma.scoped.question.findUnique({
      where: { id },
      select: { id: true, categoryId: true },
    });
    if (!question) throw new NotFoundException({ code: 'QUESTION_NOT_FOUND' });
    if (categoryId) {
      const category = await this.prisma.scoped.questionCategory.findUnique({ where: { id: categoryId } });
      if (!category) throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND' });
    }
    await this.prisma.scoped.question.update({ where: { id }, data: { categoryId } });
    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: 'QUESTION_RECATEGORIZED',
      resourceType: 'questions',
      resourceId: id,
      oldValues: { categoryId: question.categoryId },
      newValues: { categoryId },
    });
    return this.getForEdit(id);
  }

  /**
   * Retiro logico: `active=false`. Nunca se borra, porque los intentos historicos referencian
   * sus versiones y el registro debe sobrevivir a la retencion legal.
   */
  async retire(actor: AuthUser, id: string) {
    const question = await this.prisma.scoped.question.findUnique({ where: { id }, select: { id: true } });
    if (!question) throw new NotFoundException({ code: 'QUESTION_NOT_FOUND' });
    await this.prisma.scoped.question.update({ where: { id }, data: { active: false } });
    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: 'QUESTION_RETIRED',
      resourceType: 'questions',
      resourceId: id,
    });
    return { ok: true as const };
  }
}
