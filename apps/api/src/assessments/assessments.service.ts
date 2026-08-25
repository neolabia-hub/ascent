import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { UpdateAssessmentDraftInput } from '@neo-pulse/shared';
import { AuditService } from '../common/audit.service.js';
import type { AuthUser } from '../common/types.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * CONSTRUCTOR DE EVALUACIONES (CLAUDE.md 3.6).
 *
 * Una evaluacion se compone de SECCIONES: fijas (preguntas elegidas a mano) o aleatorias
 * (N preguntas al azar de una categoria). La seleccion concreta NO se resuelve aqui: se
 * materializa por intento cuando alguien rinde el examen (Sprint 4), de modo que dos personas
 * no vean el mismo examen y se pueda recalificar una pregunta defectuosa sin adivinar a quien
 * le toco.
 *
 * Igual que las actividades, la version publicada es INMUTABLE.
 */
@Injectable()
export class AssessmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const assessments = await this.prisma.scoped.assessment.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        currentVersionId: true,
        createdAt: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
          select: {
            id: true,
            versionNumber: true,
            status: true,
            passingScore: true,
            maxAttempts: true,
            _count: { select: { sections: true } },
          },
        },
      },
    });
    return assessments;
  }

  async getById(id: string) {
    const assessment = await this.prisma.scoped.assessment.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          include: { sections: { orderBy: { displayOrder: 'asc' } } },
        },
      },
    });
    if (!assessment) throw new NotFoundException({ code: 'ASSESSMENT_NOT_FOUND' });

    // Cuantas preguntas hay disponibles hoy en cada categoria usada por secciones aleatorias:
    // es lo que le dice al administrador si el examen se puede armar.
    const categoryIds = assessment.versions
      .flatMap((v) => v.sections)
      .map((s) => s.categoryId)
      .filter((id): id is string => Boolean(id));
    const availability = await this.countAvailable([...new Set(categoryIds)]);

    return {
      ...assessment,
      versions: assessment.versions.map((version) => ({
        ...version,
        sections: version.sections.map((section) => ({
          ...section,
          availableInCategory: section.categoryId ? (availability.get(section.categoryId) ?? 0) : null,
        })),
      })),
    };
  }

  async create(actor: AuthUser, title: string) {
    const tenantId = this.prisma.currentTenantId;
    const assessment = await this.prisma.tx(async (tx) => {
      const created = await tx.assessment.create({ data: { tenantId, title } });
      const version = await tx.assessmentVersion.create({
        data: { tenantId, assessmentId: created.id, versionNumber: 1, status: 'DRAFT' },
      });
      return tx.assessment.update({ where: { id: created.id }, data: { currentVersionId: version.id } });
    });
    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'ASSESSMENT_CREATED',
      resourceType: 'assessments',
      resourceId: assessment.id,
      newValues: { title },
    });
    return this.getById(assessment.id);
  }

  /** Configuracion y secciones del borrador. Reemplaza el set completo de secciones si viene. */
  async updateDraft(actor: AuthUser, versionId: string, input: UpdateAssessmentDraftInput) {
    const tenantId = this.prisma.currentTenantId;
    const version = await this.assertDraft(versionId);

    await this.prisma.tx(async (tx) => {
      await tx.assessmentVersion.update({
        where: { id: versionId },
        data: {
          timeLimitMin: input.timeLimitMin,
          maxAttempts: input.maxAttempts,
          passingScore: input.passingScore,
          gradingPolicy: input.gradingPolicy,
          shuffleQuestions: input.shuffleQuestions,
          shuffleOptions: input.shuffleOptions,
          reviewPolicy: input.reviewPolicy as Prisma.InputJsonValue | undefined,
        },
      });

      if (input.sections) {
        await tx.assessmentSection.deleteMany({ where: { assessmentVersionId: versionId } });
        for (const [index, section] of input.sections.entries()) {
          await tx.assessmentSection.create({
            data: {
              tenantId,
              assessmentVersionId: versionId,
              displayOrder: index,
              mode: section.mode,
              categoryId: section.mode === 'RANDOM_FROM_POOL' ? section.categoryId : null,
              pickCount: section.mode === 'RANDOM_FROM_POOL' ? section.pickCount : null,
              // Se guardan las VERSIONES vigentes de cada pregunta: el examen queda atado a lo
              // que el administrador vio al armarlo, no a una revision futura.
              fixedQuestionVersionIds:
                section.mode === 'FIXED' ? await this.resolveCurrentVersionIds(tx, section.questionIds) : [],
            },
          });
        }
      }
    });

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'ASSESSMENT_DRAFT_UPDATED',
      resourceType: 'assessment_versions',
      resourceId: versionId,
      oldValues: { passingScore: version.passingScore, maxAttempts: version.maxAttempts },
      newValues: input,
    });
    return this.getById(version.assessmentId);
  }

  /** Publica el borrador tras comprobar que el examen se puede armar de verdad. */
  async publish(actor: AuthUser, versionId: string) {
    const version = await this.assertDraft(versionId);
    const sections = await this.prisma.scoped.assessmentSection.findMany({
      where: { assessmentVersionId: versionId },
      orderBy: { displayOrder: 'asc' },
    });
    if (sections.length === 0) {
      throw new BadRequestException({ code: 'ASSESSMENT_EMPTY', message: 'La evaluacion necesita al menos una seccion.' });
    }

    // Una seccion aleatoria que pida mas preguntas de las que existen dejaria el examen
    // imposible de armar en tiempo de ejecucion: se detecta ANTES de publicar.
    const categoryIds = sections.map((s) => s.categoryId).filter((id): id is string => Boolean(id));
    const availability = await this.countAvailable([...new Set(categoryIds)]);
    const insufficient = sections
      .filter((s) => s.mode === 'RANDOM_FROM_POOL' && s.categoryId && s.pickCount)
      .filter((s) => (availability.get(s.categoryId as string) ?? 0) < (s.pickCount as number))
      .map((s) => ({
        sectionId: s.id,
        categoryId: s.categoryId,
        requested: s.pickCount,
        available: availability.get(s.categoryId as string) ?? 0,
      }));
    if (insufficient.length > 0) {
      throw new BadRequestException({
        code: 'NOT_ENOUGH_QUESTIONS',
        message: 'Alguna seccion aleatoria pide mas preguntas de las que hay en su categoria.',
        sections: insufficient,
      });
    }
    const emptyFixed = sections.filter((s) => s.mode === 'FIXED' && s.fixedQuestionVersionIds.length === 0);
    if (emptyFixed.length > 0) {
      throw new BadRequestException({ code: 'EMPTY_FIXED_SECTION', message: 'Hay secciones fijas sin preguntas.' });
    }

    const published = await this.prisma.tx(async (tx) => {
      const previous = await tx.assessmentVersion.findFirst({
        where: { assessmentId: version.assessmentId, status: 'PUBLISHED' },
      });
      if (previous) {
        await tx.assessmentVersion.update({ where: { id: previous.id }, data: { status: 'RETIRED' } });
      }
      const result = await tx.assessmentVersion.update({ where: { id: versionId }, data: { status: 'PUBLISHED' } });
      await tx.assessment.update({ where: { id: version.assessmentId }, data: { currentVersionId: result.id } });
      return result;
    });

    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: 'ASSESSMENT_PUBLISHED',
      resourceType: 'assessment_versions',
      resourceId: versionId,
      newValues: { versionNumber: published.versionNumber, sections: sections.length },
    });
    return published;
  }

  /** Version N+1 en borrador copiando la publicada (la publicada no se toca). */
  async createNextDraft(actor: AuthUser, assessmentId: string) {
    const tenantId = this.prisma.currentTenantId;
    const existingDraft = await this.prisma.scoped.assessmentVersion.findFirst({
      where: { assessmentId, status: 'DRAFT' },
      select: { id: true },
    });
    if (existingDraft) {
      throw new ConflictException({ code: 'DRAFT_ALREADY_EXISTS', versionId: existingDraft.id });
    }
    const source = await this.prisma.scoped.assessmentVersion.findFirst({
      where: { assessmentId, status: 'PUBLISHED' },
      include: { sections: { orderBy: { displayOrder: 'asc' } } },
    });
    if (!source) throw new NotFoundException({ code: 'NO_PUBLISHED_VERSION' });

    const draft = await this.prisma.tx(async (tx) => {
      const created = await tx.assessmentVersion.create({
        data: {
          tenantId,
          assessmentId,
          versionNumber: source.versionNumber + 1,
          status: 'DRAFT',
          timeLimitMin: source.timeLimitMin,
          maxAttempts: source.maxAttempts,
          passingScore: source.passingScore,
          gradingPolicy: source.gradingPolicy,
          shuffleQuestions: source.shuffleQuestions,
          shuffleOptions: source.shuffleOptions,
          reviewPolicy: source.reviewPolicy as Prisma.InputJsonValue,
        },
      });
      for (const section of source.sections) {
        await tx.assessmentSection.create({
          data: {
            tenantId,
            assessmentVersionId: created.id,
            displayOrder: section.displayOrder,
            mode: section.mode,
            categoryId: section.categoryId,
            pickCount: section.pickCount,
            fixedQuestionVersionIds: section.fixedQuestionVersionIds,
          },
        });
      }
      return created;
    });

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'ASSESSMENT_DRAFT_CREATED',
      resourceType: 'assessment_versions',
      resourceId: draft.id,
      newValues: { fromVersionId: source.id, versionNumber: draft.versionNumber },
    });
    return draft;
  }

  private async assertDraft(versionId: string) {
    const version = await this.prisma.scoped.assessmentVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new NotFoundException({ code: 'ASSESSMENT_VERSION_NOT_FOUND' });
    if (version.status !== 'DRAFT') {
      throw new ConflictException({
        code: 'ASSESSMENT_NOT_EDITABLE',
        message: 'Esta evaluacion esta publicada. Crea una version nueva para modificarla.',
      });
    }
    return version;
  }

  /** Preguntas activas por categoria (para validar y para avisar en la UI). */
  private async countAvailable(categoryIds: string[]): Promise<Map<string, number>> {
    if (categoryIds.length === 0) return new Map();
    const grouped = await this.prisma.scoped.question.groupBy({
      by: ['categoryId'],
      where: { categoryId: { in: categoryIds }, active: true, currentVersionId: { not: null } },
      _count: { _all: true },
    });
    return new Map(grouped.map((row) => [row.categoryId, row._count._all]));
  }

  /** Traduce ids de pregunta a los ids de su VERSION vigente. */
  private async resolveCurrentVersionIds(tx: Prisma.TransactionClient, questionIds: string[]): Promise<string[]> {
    const questions = await tx.question.findMany({
      where: { id: { in: questionIds }, currentVersionId: { not: null } },
      select: { id: true, currentVersionId: true },
    });
    const byId = new Map(questions.map((q) => [q.id, q.currentVersionId as string]));
    const missing = questionIds.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      throw new NotFoundException({ code: 'QUESTION_NOT_FOUND', missing });
    }
    // Se conserva el orden en que el administrador las eligio.
    return questionIds.map((id) => byId.get(id) as string);
  }
}
