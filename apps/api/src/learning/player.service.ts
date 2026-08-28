import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { ProgressInput } from '@neo-pulse/shared';
import { EngagementService } from '../engagement/engagement.service.js';
import type { AuthUser } from '../common/types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CompletionService } from './completion.service.js';

/**
 * EL REPRODUCTOR: lo que ve y hace la persona mientras cursa.
 *
 * Dos reglas que no se negocian:
 *  1. **Todo lo mio es solo mio.** Cada operacion comprueba que la ejecucion pertenece a quien
 *     la pide. El aislamiento por empresa (RLS) no basta: dentro de la misma empresa, el
 *     progreso de otra persona tampoco se toca.
 *  2. **El avance no retrocede.** El telefono puede reenviar progreso viejo al recuperar senal;
 *     el servidor se queda con el mayor porcentaje y acumula el tiempo. Repetir un envio nunca
 *     puede empeorar el estado de alguien.
 */
@Injectable()
export class PlayerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly completion: CompletionService,
    private readonly engagement: EngagementService,
  ) {}

  /** La ejecucion con sus piezas en orden y lo que la persona ya lleva de cada una. */
  async openEnrollment(actor: AuthUser, enrollmentId: string) {
    const enrollment = await this.requireOwn(actor, enrollmentId);

    const [contents, progress, attempts] = await Promise.all([
      this.prisma.scoped.activityContent.findMany({
        where: { activityVersionId: enrollment.activityVersionId },
        orderBy: { displayOrder: 'asc' },
        select: {
          id: true,
          type: true,
          title: true,
          displayOrder: true,
          isRequired: true,
          config: true,
          lessonId: true,
          assessmentVersionId: true,
        },
      }),
      this.prisma.scoped.activityProgress.findMany({ where: { enrollmentId } }),
      this.prisma.scoped.attempt.findMany({
        where: { enrollmentId },
        orderBy: { attemptNumber: 'asc' },
        select: { id: true, assessmentVersionId: true, attemptNumber: true, status: true, score: true, passed: true },
      }),
    ]);

    const progressByContent = new Map(progress.map((row) => [row.activityContentId, row]));
    const passed = new Set(attempts.filter((attempt) => attempt.passed).map((attempt) => attempt.assessmentVersionId));

    return {
      enrollment: {
        id: enrollment.id,
        status: enrollment.status,
        blockedAt: enrollment.blockedAt,
        blockedReason: enrollment.blockedReason,
        activityId: enrollment.activityVersion.activity.id,
        activityName: enrollment.activityVersion.activity.name,
        activityDescription: enrollment.activityVersion.activity.description,
        activityType: enrollment.activityVersion.activity.activityType,
        versionNumber: enrollment.activityVersion.versionNumber,
        passingScore: enrollment.activityVersion.passingScore,
        estimatedMinutes: enrollment.activityVersion.estimatedMinutes,
      },
      contents: contents.map((content) => {
        const own = progressByContent.get(content.id);
        return {
          id: content.id,
          type: content.type,
          title: content.title,
          isRequired: content.isRequired,
          config: content.config,
          hasLesson: content.lessonId !== null,
          assessmentVersionId: content.assessmentVersionId,
          status:
            content.type === 'ASSESSMENT' && content.assessmentVersionId && passed.has(content.assessmentVersionId)
              ? 'COMPLETED'
              : (own?.status ?? 'NOT_STARTED'),
          pct: own?.pct ?? 0,
          lastCardIndex: this.readLastCard(own?.data),
        };
      }),
      attempts,
    };
  }

  /** El material de una pieza. Las tarjetas de una leccion se sirven ya listas para el player. */
  async getContent(actor: AuthUser, contentId: string) {
    const content = await this.prisma.scoped.activityContent.findUnique({
      where: { id: contentId },
      select: {
        id: true,
        type: true,
        title: true,
        config: true,
        lessonId: true,
        contentPackageId: true,
        assessmentVersionId: true,
        activityVersionId: true,
      },
    });
    if (!content) throw new NotFoundException({ code: 'CONTENT_NOT_FOUND' });

    // Se exige tener una ejecucion abierta de ESA version: no se puede leer contenido suelto.
    const enrollment = await this.prisma.scoped.enrollment.findFirst({
      where: { userId: actor.id, activityVersionId: content.activityVersionId },
      select: { id: true },
    });
    if (!enrollment) throw new ForbiddenException({ code: 'NOT_ENROLLED' });

    const lesson = content.lessonId
      ? await this.prisma.scoped.lesson.findUnique({
          where: { id: content.lessonId },
          select: {
            id: true,
            title: true,
            estimatedMinutes: true,
            cards: {
              orderBy: { displayOrder: 'asc' },
              select: { id: true, cardType: true, payload: true, mediaKey: true },
            },
          },
        })
      : null;

    const documentPackage = content.contentPackageId
      ? await this.prisma.scoped.contentPackage.findUnique({
          where: { id: content.contentPackageId },
          select: { id: true, kind: true, storageKey: true, originalName: true, mimeType: true, sizeBytes: true },
        })
      : null;

    return { content, enrollmentId: enrollment.id, lesson, package: documentPackage };
  }

  /**
   * Guarda el avance de una pieza. Acumulativo e idempotente: es el endpoint que mas veces va a
   * recibir envios repetidos desde un telefono que recupera senal.
   */
  async saveProgress(actor: AuthUser, contentId: string, input: ProgressInput) {
    const tenantId = this.prisma.currentTenantId;
    const content = await this.prisma.scoped.activityContent.findUnique({
      where: { id: contentId },
      select: { id: true, type: true, isRequired: true, activityVersionId: true, config: true },
    });
    if (!content) throw new NotFoundException({ code: 'CONTENT_NOT_FOUND' });

    const enrollment = await this.prisma.scoped.enrollment.findFirst({
      where: { userId: actor.id, activityVersionId: content.activityVersionId },
      select: { id: true, status: true },
    });
    if (!enrollment) throw new ForbiddenException({ code: 'NOT_ENROLLED' });

    const existing = await this.prisma.scoped.activityProgress.findUnique({
      where: { enrollmentId_activityContentId: { enrollmentId: enrollment.id, activityContentId: contentId } },
    });

    const pct = Math.max(existing?.pct ?? 0, input.pct);
    const timeSpentS = (existing?.timeSpentS ?? 0) + input.secondsSpent;
    const wasCompleted = existing?.status === 'COMPLETED';
    const completed = this.meetsCompletion(content.type, content.config, pct, timeSpentS);
    const now = new Date();

    await this.prisma.scoped.activityProgress.upsert({
      where: { enrollmentId_activityContentId: { enrollmentId: enrollment.id, activityContentId: contentId } },
      create: {
        tenantId,
        enrollmentId: enrollment.id,
        activityContentId: contentId,
        status: completed ? 'COMPLETED' : 'IN_PROGRESS',
        pct,
        timeSpentS,
        firstAt: now,
        lastAt: now,
        data: this.writeLastCard(input.lastCardIndex),
      },
      update: {
        status: completed ? 'COMPLETED' : 'IN_PROGRESS',
        pct,
        timeSpentS,
        lastAt: now,
        ...(input.lastCardIndex !== undefined ? { data: this.writeLastCard(input.lastCardIndex) } : {}),
      },
    });

    await this.prisma.scoped.learningEvent.create({
      data: {
        tenantId,
        userId: actor.id,
        enrollmentId: enrollment.id,
        verb: completed && !wasCompleted ? 'COMPLETED' : 'PROGRESSED',
        objectType: 'activity_contents',
        objectId: contentId,
        result: { pct, timeSpentS } as Prisma.InputJsonValue,
      },
    });

    // La racha se mueve solo la PRIMERA vez que se completa una leccion, y solo con lecciones.
    let streak = null;
    if (completed && !wasCompleted && content.type === 'LESSON') {
      streak = await this.engagement.awardLessonCompleted(this.prisma.scoped, tenantId, actor.id, contentId);
    }

    const outcome = await this.completion.evaluate(enrollment.id);
    return { pct, timeSpentS, completed, streak, enrollment: outcome };
  }

  /**
   * Criterio de completitud de una pieza. El "tiempo minimo" es el freno al click siguiente: no
   * bloquea a nadie, pero no da por vista una tarjeta que estuvo dos segundos en pantalla.
   */
  private meetsCompletion(type: string, config: Prisma.JsonValue, pct: number, timeSpentS: number): boolean {
    const settings = (config ?? {}) as { minWatchPct?: number; minSeconds?: number };
    if (type === 'VIDEO') {
      const required = settings.minWatchPct ?? 90;
      return pct >= required;
    }
    const minSeconds = settings.minSeconds ?? 0;
    return pct >= 100 && timeSpentS >= minSeconds;
  }

  private readLastCard(data: Prisma.JsonValue | undefined): number {
    const parsed = (data ?? {}) as { lastCardIndex?: unknown };
    return typeof parsed.lastCardIndex === 'number' ? parsed.lastCardIndex : 0;
  }

  private writeLastCard(index: number | undefined): Prisma.InputJsonValue {
    return { lastCardIndex: index ?? 0 };
  }

  /** Ninguna operacion del reproductor toca la ejecucion de otra persona. */
  private async requireOwn(actor: AuthUser, enrollmentId: string) {
    const enrollment = await this.prisma.scoped.enrollment.findUnique({
      where: { id: enrollmentId },
      select: {
        id: true,
        userId: true,
        status: true,
        blockedAt: true,
        blockedReason: true,
        activityVersionId: true,
        activityVersion: {
          select: {
            versionNumber: true,
            passingScore: true,
            estimatedMinutes: true,
            // La identidad de la actividad viaja para que la portada de la ficha sea LA MISMA que
            // la del catalogo: si cada pantalla dibujara la suya, la persona no reconoceria que
            // esta entrando a lo que acaba de pulsar.
            activity: {
              select: {
                id: true,
                name: true,
                description: true,
                activityType: { select: { code: true, name: true, colorHex: true } },
              },
            },
          },
        },
      },
    });
    if (!enrollment) throw new NotFoundException({ code: 'ENROLLMENT_NOT_FOUND' });
    if (enrollment.userId !== actor.id) throw new ForbiddenException({ code: 'NOT_YOUR_ENROLLMENT' });
    return enrollment;
  }
}
