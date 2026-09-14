import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { tenantSettingsSchema, type SubmitReviewInput } from '@neo-pulse/shared';
import { toLearnerView } from '../assessments/question-payload.js';
import { gradeQuestion } from '../learning/grading.js';
import { PrismaService, type TenantPrisma } from '../prisma/prisma.service.js';
import { enterQueue, nextState, REVIEW_SESSION_SIZE } from './spaced-repetition.js';
import { advanceStreak, lastActivityLabel, POINTS, type StreakState } from './streak.js';

/**
 * ENGAGEMENT: lo que hace que la gente vuelva sin convertir la formacion en un concurso.
 *
 * Tres piezas, y las tres son deliberadamente sobrias (Decision #22 y #23):
 *  - la COLA DE REPASO, que trae de vuelta lo que se fallo,
 *  - la RACHA, privada, cuya unidad es haber aprendido algo (no haber entrado),
 *  - los PUNTOS, que solo se ganan por logro real.
 *
 * Lo que NO hay, a proposito: ranking individual publico, insignias por ingresar y moneda
 * virtual. La comparacion publica expulsa a los de abajo, que son quienes mas necesitan formarse.
 */
@Injectable()
export class EngagementService {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────── Cola de repaso ───────────────────────────

  /**
   * LOS ESCALONES DEL TENANT, resueltos UNA vez por operacion.
   *
   * Nunca se llama dentro de un bucle por pregunta: eso convertiria una carga de 40 preguntas
   * falladas en 40 idas a la base solo para leer un ajuste que no cambia entre una y la siguiente.
   */
  private async intervalosDe(tenantId: string): Promise<number[]> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
    return tenantSettingsSchema.parse(tenant?.settings ?? {}).reviewIntervalsDays;
  }

  /** Las preguntas falladas entran a la cola (o retroceden si ya estaban). */
  async recordFailures(
    db: TenantPrisma,
    tenantId: string,
    userId: string,
    enrollmentId: string,
    questionVersionIds: string[],
  ): Promise<void> {
    if (questionVersionIds.length === 0) return;
    const now = new Date();
    const [existing, intervals] = await Promise.all([
      db.reviewQueueItem.findMany({ where: { userId, questionVersionId: { in: questionVersionIds } } }),
      this.intervalosDe(tenantId),
    ]);
    const byQuestion = new Map(existing.map((item) => [item.questionVersionId, item]));

    for (const questionVersionId of questionVersionIds) {
      const current = byQuestion.get(questionVersionId);
      if (!current) {
        const fresh = enterQueue(now, intervals);
        await db.reviewQueueItem.create({
          data: {
            tenantId,
            userId,
            questionVersionId,
            sourceEnrollmentId: enrollmentId,
            stage: fresh.stage,
            dueAt: fresh.dueAt,
            lapses: fresh.lapses,
            lastResult: fresh.lastResult,
          },
        });
        continue;
      }
      // Volver a fallarla la acerca en el tiempo, incluso si ya estaba dominada.
      const back = nextState({ stage: current.stage, lapses: current.lapses, retired: current.retired }, false, now, intervals);
      await db.reviewQueueItem.update({
        where: { id: current.id },
        data: { stage: back.stage, lapses: back.lapses, retired: false, dueAt: back.dueAt, lastResult: back.lastResult },
      });
    }
  }

  /**
   * La sesion de repaso del dia: lo vencido, acotado. El compromiso con el colaborador es de 3 a
   * 5 minutos; una cola de 40 preguntas rompe ese compromiso y hace que nadie la abra.
   */
  async todayReview(userId: string) {
    const items = await this.prisma.scoped.reviewQueueItem.findMany({
      where: { userId, retired: false, dueAt: { lte: new Date() } },
      orderBy: { dueAt: 'asc' },
      take: REVIEW_SESSION_SIZE,
    });
    if (items.length === 0) {
      // Sin nada vencido HOY, la pantalla debe poder decir "no tienes repaso, vuelve el ...":
      // dejarla en blanco haria pensar que la funcion no sirve.
      const next = await this.prisma.scoped.reviewQueueItem.findFirst({
        where: { userId, retired: false },
        orderBy: { dueAt: 'asc' },
        select: { dueAt: true },
      });
      const pendingLater = await this.prisma.scoped.reviewQueueItem.count({ where: { userId, retired: false } });
      return { items: [], total: 0, pendingLater, nextDueAt: next?.dueAt ?? null };
    }

    const versions = await this.prisma.scoped.questionVersion.findMany({
      where: { id: { in: items.map((item) => item.questionVersionId) } },
      select: { id: true, qtype: true, stem: true, options: true, correct: true, feedback: true, points: true },
    });
    const byId = new Map(versions.map((version) => [version.id, version]));

    return {
      total: items.length,
      pendingLater: 0,
      nextDueAt: null as Date | null,
      // toLearnerView es la UNICA forma de servir una pregunta: quita la respuesta correcta y la
      // retroalimentacion por opcion, que la delataria.
      items: items
        .map((item) => byId.get(item.questionVersionId))
        .filter((version): version is NonNullable<typeof version> => Boolean(version))
        .map((version) => toLearnerView(version)),
    };
  }

  /** Responde el repaso: actualiza escalones, suma puntos y devuelve que tal fue. */
  async answerReview(userId: string, input: SubmitReviewInput) {
    const tenantId = this.prisma.currentTenantId;
    const now = new Date();
    const questionVersionIds = input.answers.map((answer) => answer.questionVersionId);

    const [items, versions, intervals] = await Promise.all([
      this.prisma.scoped.reviewQueueItem.findMany({ where: { userId, questionVersionId: { in: questionVersionIds } } }),
      this.prisma.scoped.questionVersion.findMany({
        where: { id: { in: questionVersionIds } },
        select: { id: true, qtype: true, correct: true, points: true },
      }),
      this.intervalosDe(tenantId),
    ]);
    const itemByQuestion = new Map(items.map((item) => [item.questionVersionId, item]));
    const versionById = new Map(versions.map((version) => [version.id, version]));

    let correctCount = 0;
    const results: Array<{ questionVersionId: string; correct: boolean }> = [];

    for (const answer of input.answers) {
      const item = itemByQuestion.get(answer.questionVersionId);
      const version = versionById.get(answer.questionVersionId);
      if (!item || !version) continue;

      const grade = gradeQuestion(
        { qtype: version.qtype, correct: version.correct, pointsPossible: Number(version.points) },
        answer.answer as Prisma.JsonValue,
      );
      const transition = nextState({ stage: item.stage, lapses: item.lapses, retired: item.retired }, grade.correct, now, intervals);

      await this.prisma.scoped.reviewQueueItem.update({
        where: { id: item.id },
        data: {
          stage: transition.stage,
          lapses: transition.lapses,
          retired: transition.retired,
          dueAt: transition.dueAt,
          lastResult: transition.lastResult,
        },
      });
      await this.prisma.scoped.learningEvent.create({
        data: {
          tenantId,
          userId,
          verb: 'REVIEW_ANSWERED',
          objectType: 'question_versions',
          objectId: answer.questionVersionId,
          result: { correct: grade.correct, stage: transition.stage } as Prisma.InputJsonValue,
        },
      });

      if (grade.correct) correctCount += 1;
      results.push({ questionVersionId: answer.questionVersionId, correct: grade.correct });
    }

    await this.addPoints(this.prisma.scoped, tenantId, userId, POINTS.REVIEW_SESSION, 'REVIEW_SESSION', null, null);
    return { answered: results.length, correct: correctCount, results };
  }

  // ─────────────────────────── Racha y puntos ───────────────────────────

  /**
   * Una leccion completada mueve la racha. Es lo unico que la mueve: abrir la aplicacion no
   * cuenta, porque la racha premia haber aprendido algo.
   */
  async awardLessonCompleted(db: TenantPrisma, tenantId: string, userId: string, contentId: string) {
    const streak = await this.updateStreak(db, tenantId, userId);
    await this.addPoints(db, tenantId, userId, POINTS.LESSON_COMPLETED, 'LESSON_COMPLETED', 'activity_contents', contentId);
    return streak;
  }

  async awardActivityCompleted(db: TenantPrisma, tenantId: string, userId: string, enrollmentId: string): Promise<void> {
    await this.addPoints(db, tenantId, userId, POINTS.ACTIVITY_COMPLETED, 'ACTIVITY_COMPLETED', 'enrollments', enrollmentId);
  }

  async awardAssessmentPassed(db: TenantPrisma, tenantId: string, userId: string, attemptId: string): Promise<void> {
    await this.addPoints(db, tenantId, userId, POINTS.ASSESSMENT_PASSED, 'ASSESSMENT_PASSED', 'attempts', attemptId);
  }

  /** Mi racha y mis puntos. Solo del propio usuario: la racha es privada (Decision #23). */
  async myProgress(userId: string) {
    const [streak, points] = await Promise.all([
      this.prisma.scoped.userStreak.findUnique({ where: { userId } }),
      this.prisma.scoped.pointsLedgerEntry.aggregate({ where: { userId }, _sum: { points: true } }),
    ]);
    const state: StreakState = {
      currentStreak: streak?.currentStreak ?? 0,
      longestStreak: streak?.longestStreak ?? 0,
      lastActivityDate: streak?.lastActivityDate ?? null,
      freezesAvailable: streak?.freezesAvailable ?? 2,
    };
    return { ...state, lastActivityDate: lastActivityLabel(state), points: points._sum.points ?? 0 };
  }

  private async updateStreak(db: TenantPrisma, tenantId: string, userId: string) {
    const current = await db.userStreak.findUnique({ where: { userId } });
    const state: StreakState = {
      currentStreak: current?.currentStreak ?? 0,
      longestStreak: current?.longestStreak ?? 0,
      lastActivityDate: current?.lastActivityDate ?? null,
      freezesAvailable: current?.freezesAvailable ?? 2,
    };
    const next = advanceStreak(state, new Date());

    await db.userStreak.upsert({
      where: { userId },
      create: {
        userId,
        tenantId,
        currentStreak: next.currentStreak,
        longestStreak: next.longestStreak,
        lastActivityDate: next.lastActivityDate,
        freezesAvailable: next.freezesAvailable,
      },
      update: {
        currentStreak: next.currentStreak,
        longestStreak: next.longestStreak,
        lastActivityDate: next.lastActivityDate,
        freezesAvailable: next.freezesAvailable,
      },
    });
    return next;
  }

  private async addPoints(
    db: TenantPrisma,
    tenantId: string,
    userId: string,
    points: number,
    reasonCode: string,
    refType: string | null,
    refId: string | null,
  ): Promise<void> {
    await db.pointsLedgerEntry.create({ data: { tenantId, userId, points, reasonCode, refType, refId } });
  }
}
