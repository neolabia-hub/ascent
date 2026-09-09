import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PresentationInput, UpdateAssessmentDraftInput } from '@neo-pulse/shared';
import { AuditService } from '../common/audit.service.js';
import type { AuthUser } from '../common/types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { columnsToPayload } from './question-payload.js';

/**
 * CONSTRUCTOR DE EVALUACIONES (CLAUDE.md 3.6).
 *
 * UNA EVALUACION ES UN OBJETO PLANO, como una leccion (Decision #87). Se edita siempre, sin
 * publicar nada, y publicar la FORMACION congela una COPIA (`clonarParaPublicar`).
 *
 * Antes tenia su propia escalera de versiones, que era una SEGUNDA solucion al mismo problema que
 * la version de la formacion ya resolvia. Las dos escaleras no estaban sincronizadas, y de ahi
 * salian cuatro daños —el peor: publicar la v2 retiraba la v1 mientras el contenido de la
 * formacion seguia apuntando a ella, y el examen dejaba de poder abrirse—.
 *
 * DOS CLASES DE FILA, y la diferencia es `sourceId`:
 *
 *   EDITABLE  `sourceId = null`. Es la que sale en /evaluaciones y la unica que se toca.
 *   COPIA     `sourceId = <la editable>`, estado PUBLISHED. Nace al publicar una formacion, vive
 *             dentro de ella y no se edita jamas. Es lo que sostiene los intentos.
 *
 * La seleccion concreta de preguntas NO se resuelve aqui: se materializa por intento cuando
 * alguien rinde el examen, de modo que dos personas no vean lo mismo y se pueda recalificar una
 * pregunta defectuosa sin adivinar a quien le toco.
 */
@Injectable()
export class AssessmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Solo las EDITABLES: las copias congeladas viven dentro de una formacion, no en el listado. */
  async list() {
    return this.prisma.scoped.assessment.findMany({
      where: { sourceId: null },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        passingScore: true,
        maxAttempts: true,
        timeLimitMin: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { sections: true, copias: true } },
      },
    });
  }

  /**
   * EL LIENZO NECESITA LA PREGUNTA ENTERA (Decision #84).
   *
   * La pantalla de armado no es una lista de enunciados: cada pregunta se ve y se edita como la
   * vera el empleado, con sus opciones y la correcta marcada. Para eso hace falta el payload
   * completo —`options` y `correct`—, que antes obligaba a pedir cada pregunta por separado.
   *
   * `correct` SOLO viaja si quien pregunta puede editar el banco: este endpoint es `catalog:read`
   * y por ahi tambien entra quien solo esta mirando el catalogo.
   */
  async getById(id: string, conRespuestas = false) {
    const assessment = await this.prisma.scoped.assessment.findUnique({
      where: { id },
      include: {
        sections: { orderBy: { displayOrder: 'asc' } },
        _count: { select: { copias: true } },
      },
    });
    if (!assessment) throw new NotFoundException({ code: 'ASSESSMENT_NOT_FOUND' });

    // Cuantas preguntas hay disponibles HOY en cada tema usado por bloques al azar: es lo que le
    // dice a quien administra si el examen se puede armar.
    const categoryIds = assessment.sections
      .map((section) => section.categoryId)
      .filter((value): value is string => Boolean(value));
    const availability = await this.countAvailable([...new Set(categoryIds)]);

    const versionIds = assessment.sections.flatMap((section) => section.fixedQuestionVersionIds);
    const preguntas = versionIds.length
      ? await this.prisma.scoped.questionVersion.findMany({
          where: { id: { in: [...new Set(versionIds)] } },
          select: {
            id: true,
            questionId: true,
            versionNumber: true,
            qtype: true,
            stem: true,
            points: true,
            options: true,
            correct: true,
            feedback: true,
            question: { select: { category: { select: { id: true, name: true } } } },
          },
        })
      : [];
    const porVersion = new Map(preguntas.map((row) => [row.id, row]));

    return {
      ...assessment,
      /** `true` = ya esta dentro de alguna formacion publicada, con copias congeladas. */
      enUso: assessment._count.copias > 0,
      sections: assessment.sections.map((section) => ({
        ...section,
        availableInCategory: section.categoryId ? (availability.get(section.categoryId) ?? 0) : null,
        // En el ORDEN en que se guardaron: el orden de las preguntas es una decision de quien
        // arma el examen, y `findMany` no lo respeta.
        fixedQuestions: section.fixedQuestionVersionIds.flatMap((versionId) => {
          const row = porVersion.get(versionId);
          return row
            ? [
                {
                  questionVersionId: row.id,
                  questionId: row.questionId,
                  versionNumber: row.versionNumber,
                  qtype: row.qtype,
                  stem: row.stem,
                  points: Number(row.points),
                  categoryId: row.question.category?.id ?? null,
                  categoryName: row.question.category?.name ?? null,
                  payload: conRespuestas ? columnsToPayload(row) : null,
                },
              ]
            : [];
        }),
      })),
    };
  }

  async create(actor: AuthUser, title: string) {
    const tenantId = this.prisma.currentTenantId;
    const assessment = await this.prisma.scoped.assessment.create({
      data: { tenantId, title, createdBy: actor.id },
    });
    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'ASSESSMENT_CREATED',
      resourceType: 'assessments',
      resourceId: assessment.id,
      newValues: { title },
    });
    return this.getById(assessment.id, true);
  }

  /**
   * Guardar la evaluacion: sus reglas y su secuencia. Reemplaza el set completo de secciones.
   *
   * NO HAY ESTADO QUE COMPROBAR: una evaluacion editable se edita siempre. Lo que queda congelado
   * es la COPIA que se hizo al publicar la formacion, y esa no pasa por aqui.
   */
  async update(actor: AuthUser, id: string, input: UpdateAssessmentDraftInput) {
    const tenantId = this.prisma.currentTenantId;
    const antes = await this.assertEditable(id);

    if (input.sections) {
      const vacias = input.sections.filter(
        (section) => section.mode === 'FIXED' && section.questionIds.length === 0,
      );
      if (vacias.length > 0) {
        throw new BadRequestException({ code: 'EMPTY_FIXED_SECTION', message: 'Hay un bloque de preguntas vacio.' });
      }
    }

    await this.prisma.tx(async (tx) => {
      await tx.assessment.update({
        where: { id },
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
        await tx.assessmentSection.deleteMany({ where: { assessmentId: id } });
        for (const [index, section] of input.sections.entries()) {
          await tx.assessmentSection.create({
            data: {
              tenantId,
              assessmentId: id,
              displayOrder: index,
              mode: section.mode,
              categoryId: section.mode === 'RANDOM_FROM_POOL' ? section.categoryId : null,
              pickCount: section.mode === 'RANDOM_FROM_POOL' ? section.pickCount : null,
              // Se guardan las VERSIONES vigentes de cada pregunta: el examen queda atado a lo que
              // quien administra vio al armarlo, no a una revision futura.
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
      action: 'ASSESSMENT_UPDATED',
      resourceType: 'assessments',
      resourceId: id,
      oldValues: { passingScore: antes.passingScore, maxAttempts: antes.maxAttempts },
      newValues: input,
    });
    return this.getById(id, true);
  }

  /**
   * COMO SE VE el examen (Decision #85).
   *
   * Se puede cambiar aunque la evaluacion ya este dentro de formaciones publicadas, y llega
   * tambien a esas: el acento y la transicion no son evidencia —no cambian que se pregunto ni
   * como se califico— y las copias congeladas leen la presentacion de su origen.
   */
  async updatePresentation(actor: AuthUser, id: string, presentation: PresentationInput) {
    const assessment = await this.prisma.scoped.assessment.findUnique({
      where: { id },
      select: { id: true, presentation: true },
    });
    if (!assessment) throw new NotFoundException({ code: 'ASSESSMENT_NOT_FOUND' });
    await this.prisma.scoped.assessment.update({
      where: { id },
      data: { presentation: presentation as unknown as Prisma.InputJsonValue },
    });
    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: 'ASSESSMENT_PRESENTATION_UPDATED',
      resourceType: 'assessments',
      resourceId: id,
      oldValues: assessment.presentation as Prisma.JsonObject,
      newValues: presentation,
    });
    return this.getById(id, true);
  }

  /**
   * LA COPIA CONGELADA, que se hace al publicar la FORMACION. Es el equivalente exacto de
   * `cloneLesson`: a partir de aqui, editar la evaluacion no toca a quien ya la esta cursando.
   *
   * Aqui se comprueba lo que antes se comprobaba al publicar la evaluacion —que un bloque al azar
   * no pida mas preguntas de las que hay—, porque este es ahora el momento en que el examen tiene
   * que poder armarse de verdad.
   */
  async clonarParaPublicar(tx: Prisma.TransactionClient, tenantId: string, assessmentId: string): Promise<string> {
    const source = await tx.assessment.findUniqueOrThrow({
      where: { id: assessmentId },
      include: { sections: { orderBy: { displayOrder: 'asc' } } },
    });
    // Ya es una copia (republicar una formacion sin tocar su examen): se reutiliza tal cual.
    if (source.sourceId) return source.id;

    if (source.sections.length === 0) {
      throw new BadRequestException({
        code: 'ASSESSMENT_EMPTY',
        message: `La evaluacion "${source.title}" no tiene ninguna pregunta.`,
      });
    }

    const categoryIds = source.sections
      .map((section) => section.categoryId)
      .filter((value): value is string => Boolean(value));
    const disponibles = await this.countAvailableWith(tx, [...new Set(categoryIds)]);
    const cortos = source.sections.filter(
      (section) =>
        section.mode === 'RANDOM_FROM_POOL' &&
        section.categoryId &&
        (disponibles.get(section.categoryId) ?? 0) < (section.pickCount ?? 0),
    );
    if (cortos.length > 0) {
      throw new BadRequestException({
        code: 'NOT_ENOUGH_QUESTIONS',
        message: `Un bloque al azar de "${source.title}" pide mas preguntas de las que hay en su tema.`,
      });
    }

    const clone = await tx.assessment.create({
      data: {
        tenantId,
        title: source.title,
        status: 'PUBLISHED',
        sourceId: source.id,
        timeLimitMin: source.timeLimitMin,
        maxAttempts: source.maxAttempts,
        passingScore: source.passingScore,
        gradingPolicy: source.gradingPolicy,
        shuffleQuestions: source.shuffleQuestions,
        shuffleOptions: source.shuffleOptions,
        reviewPolicy: source.reviewPolicy as Prisma.InputJsonValue,
        presentation: source.presentation as Prisma.InputJsonValue,
        createdBy: source.createdBy,
      },
    });
    for (const section of source.sections) {
      await tx.assessmentSection.create({
        data: {
          tenantId,
          assessmentId: clone.id,
          displayOrder: section.displayOrder,
          mode: section.mode,
          categoryId: section.categoryId,
          pickCount: section.pickCount,
          fixedQuestionVersionIds: section.fixedQuestionVersionIds,
        },
      });
    }
    return clone.id;
  }

  /**
   * ELIMINAR la evaluacion.
   *
   * La frontera es la misma que en el resto del producto: no se borra lo que ya es EVIDENCIA. Una
   * evaluacion que alguien respondio sostiene su nota, y una que esta dentro de una formacion es
   * parte de lo que esa gente curso.
   *
   * Se mira tambien a traves de las COPIAS: los intentos cuelgan de ellas y no de la editable, asi
   * que preguntar solo por la editable diria que no la ha respondido nadie.
   */
  async remove(actor: AuthUser, id: string) {
    const assessment = await this.prisma.scoped.assessment.findUnique({
      where: { id },
      select: { id: true, title: true, sourceId: true, copias: { select: { id: true } } },
    });
    if (!assessment) throw new NotFoundException({ code: 'ASSESSMENT_NOT_FOUND' });
    if (assessment.sourceId) {
      throw new ConflictException({
        code: 'ASSESSMENT_IS_COPY',
        message: 'Esta es la copia congelada dentro de una formación. Se quita desde la formación.',
      });
    }

    const familia = [id, ...assessment.copias.map((row) => row.id)];
    const [enUso, intentos] = await Promise.all([
      this.prisma.scoped.activityContent.count({ where: { assessmentId: { in: familia } } }),
      this.prisma.scoped.attempt.count({ where: { assessmentId: { in: familia } } }),
    ]);
    if (intentos > 0) {
      throw new ConflictException({
        code: 'ASSESSMENT_HAS_ATTEMPTS',
        message:
          intentos === 1
            ? 'Una persona ya la respondio: esa nota es suya y no se borra.'
            : `Ya hay ${intentos} intentos respondidos: esas notas son de personas y no se borran.`,
      });
    }
    if (enUso > 0) {
      throw new ConflictException({
        code: 'ASSESSMENT_IN_USE',
        message:
          enUso === 1
            ? 'Esta dentro de una formacion: quitala de ahi antes de eliminarla.'
            : `Esta dentro de ${enUso} formaciones: quitala de ellas antes de eliminarla.`,
      });
    }

    await this.prisma.tx(async (tx) => {
      await tx.assessmentSection.deleteMany({ where: { assessmentId: { in: familia } } });
      await tx.assessment.deleteMany({ where: { id: { in: assessment.copias.map((row) => row.id) } } });
      await tx.assessment.delete({ where: { id } });
    });
    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: 'ASSESSMENT_DELETED',
      resourceType: 'assessments',
      resourceId: id,
      oldValues: { title: assessment.title, copias: assessment.copias.length },
    });
    return { ok: true as const };
  }

  /** Una copia congelada no se edita: es lo que sostiene los intentos de quien ya la rindio. */
  private async assertEditable(id: string) {
    const assessment = await this.prisma.scoped.assessment.findUnique({ where: { id } });
    if (!assessment) throw new NotFoundException({ code: 'ASSESSMENT_NOT_FOUND' });
    if (assessment.sourceId) {
      throw new ConflictException({
        code: 'ASSESSMENT_NOT_EDITABLE',
        message: 'Esta es la copia congelada dentro de una formación y no se modifica.',
      });
    }
    return assessment;
  }

  /** Preguntas activas por tema (para validar y para avisar en la UI). */
  private countAvailable(categoryIds: string[]): Promise<Map<string, number>> {
    return this.countAvailableWith(this.prisma.scoped, categoryIds);
  }

  private async countAvailableWith(
    // Sirve tanto al cliente con alcance de tenant como al de una transaccion: publicar la
    // formacion lo llama DENTRO de la suya y no puede salirse de ella a preguntar.
    db: { question: { groupBy: (args: never) => Promise<Array<{ categoryId: string | null; _count: { _all: number } }>> } },
    categoryIds: string[],
  ): Promise<Map<string, number>> {
    if (categoryIds.length === 0) return new Map();
    const grouped = await db.question.groupBy({
      by: ['categoryId'],
      where: { categoryId: { in: categoryIds }, active: true, currentVersionId: { not: null } },
      _count: { _all: true },
    } as never);
    // `categoryId` es nullable desde la Decision #84, pero aqui se pregunto por ids concretos: el
    // grupo "sin tema" no puede salir, y si saliera no le corresponde ningun bloque al azar.
    return new Map(
      grouped.flatMap((row) => (row.categoryId ? [[row.categoryId, row._count._all] as [string, number]] : [])),
    );
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
    // Se conserva el orden en que quien administra las eligio.
    return questionIds.map((id) => byId.get(id) as string);
  }
}
