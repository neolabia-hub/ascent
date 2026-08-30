import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService, type TenantPrisma } from '../prisma/prisma.service.js';
import { EngagementService } from '../engagement/engagement.service.js';

export interface CompletionOutcome {
  status: 'IN_PROGRESS' | 'COMPLETED' | 'PASSED' | 'FAILED';
  /** Contenidos requeridos que faltan, para que la pantalla diga QUE falta y no solo "no". */
  missing: string[];
  assignmentClosed: boolean;
}

/**
 * CIERRE DEL CICLO. Es la pieza que une las tres capas del modelo:
 *
 *   la persona termina la EJECUCION -> se cumple su OBLIGACION -> el PLAN sube su cobertura
 *
 * Hasta el Sprint 3 la obligacion se creaba pero nada la cerraba: la cobertura del plan se
 * quedaba en cero por diseno, y era la deuda declarada de ese sprint. Aqui se paga.
 *
 * Cerrar la obligacion tambien habilita la RONDA SIGUIENTE del requisito recurrente (la
 * reinduccion del ano que viene se cuenta desde que esta se completo, no desde su vencimiento).
 */
@Injectable()
export class CompletionService {
  private readonly logger = new Logger(CompletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engagement: EngagementService,
  ) {}

  /**
   * Evalua si la ejecucion quedo completa y, si es asi, la cierra.
   *
   * Criterio: TODOS los contenidos requeridos completados; y si hay evaluacion requerida, haberla
   * aprobado. Se recalcula desde los hechos guardados en vez de confiar en un contador, para que
   * un progreso perdido por falta de senal no deje a alguien aprobado sin haber visto nada.
   */
  async evaluate(enrollmentId: string): Promise<CompletionOutcome> {
    const tenantId = this.prisma.currentTenantId;
    return this.evaluateWith(this.prisma.scoped, tenantId, enrollmentId);
  }

  async evaluateWith(db: TenantPrisma, tenantId: string, enrollmentId: string): Promise<CompletionOutcome> {
    const enrollment = await db.enrollment.findUnique({
      where: { id: enrollmentId },
      select: {
        id: true,
        userId: true,
        status: true,
        assignmentId: true,
        activityVersionId: true,
        blockedAt: true,
        activityVersion: {
          select: {
            activityId: true,
            passingScore: true,
            contents: {
              select: { id: true, title: true, type: true, isRequired: true, assessmentVersionId: true },
              orderBy: { displayOrder: 'asc' },
            },
          },
        },
      },
    });
    if (!enrollment) return { status: 'IN_PROGRESS', missing: [], assignmentClosed: false };

    const [progress, passedAttempts] = await Promise.all([
      db.activityProgress.findMany({ where: { enrollmentId }, select: { activityContentId: true, status: true } }),
      db.attempt.findMany({ where: { enrollmentId, passed: true }, select: { assessmentVersionId: true } }),
    ]);
    const doneContents = new Set(progress.filter((row) => row.status === 'COMPLETED').map((row) => row.activityContentId));
    const passedAssessments = new Set(passedAttempts.map((row) => row.assessmentVersionId));

    const required = enrollment.activityVersion.contents.filter((content) => content.isRequired);
    const missing = required
      .filter((content) =>
        content.type === 'ASSESSMENT' && content.assessmentVersionId
          ? !passedAssessments.has(content.assessmentVersionId)
          : !doneContents.has(content.id),
      )
      .map((content) => content.title);

    if (missing.length > 0) {
      // Bloqueada por intentos agotados: la ejecucion queda REPROBADA, no eternamente en curso.
      if (enrollment.blockedAt) {
        await this.markStatus(db, enrollmentId, 'FAILED');
        return { status: 'FAILED', missing, assignmentClosed: false };
      }
      if (enrollment.status === 'ENROLLED') {
        await this.markStatus(db, enrollmentId, 'IN_PROGRESS');
      }
      return { status: 'IN_PROGRESS', missing, assignmentClosed: false };
    }

    // Con evaluacion de por medio, "aprobado" dice mas que "completado" y es lo que exige el
    // auditor; sin evaluacion, completar es todo lo que habia que hacer.
    const hasAssessment = required.some((content) => content.type === 'ASSESSMENT');
    const finalStatus = hasAssessment ? 'PASSED' : 'COMPLETED';

    if (enrollment.status === finalStatus) {
      return { status: finalStatus, missing: [], assignmentClosed: false };
    }

    const completedAt = new Date();
    await db.enrollment.update({
      where: { id: enrollmentId },
      data: { status: finalStatus, completedAt },
    });

    const assignmentClosed = await this.closeAssignment(db, enrollment, completedAt);

    await db.learningEvent.create({
      data: {
        tenantId,
        userId: enrollment.userId,
        enrollmentId,
        verb: finalStatus === 'PASSED' ? 'PASSED' : 'COMPLETED',
        objectType: 'activity_versions',
        objectId: enrollment.activityVersionId,
        result: { closedAssignment: assignmentClosed } as Prisma.InputJsonValue,
      },
    });

    await this.engagement.awardActivityCompleted(db, tenantId, enrollment.userId, enrollmentId).catch((error: unknown) => {
      // El reconocimiento nunca puede tumbar el registro formativo, que es el dato legal.
      this.logger.error(`No se pudo registrar el reconocimiento de ${enrollment.userId}`, error as Error);
    });

    return { status: finalStatus, missing: [], assignmentClosed };
  }

  /**
   * Cierra la obligacion que esta ejecucion satisface. Si la persona lo hizo por su cuenta (sin
   * venir de una asignacion), igual se busca una obligacion viva de esa misma actividad: haberlo
   * hecho por iniciativa propia tambien cumple.
   */
  private async closeAssignment(
    db: TenantPrisma,
    enrollment: { id: string; userId: string; assignmentId: string | null; activityVersion: { activityId: string } },
    completedAt: Date,
  ): Promise<boolean> {
    const assignment = enrollment.assignmentId
      ? await db.assignment.findUnique({ where: { id: enrollment.assignmentId } })
      : await db.assignment.findFirst({
          where: {
            userId: enrollment.userId,
            targetType: 'ACTIVITY',
            targetId: enrollment.activityVersion.activityId,
            status: { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE'] },
          },
          orderBy: { dueAt: 'asc' },
        });
    if (!assignment || assignment.status === 'COMPLETED') return false;

    await db.assignment.update({
      where: { id: assignment.id },
      data: { status: 'COMPLETED', completedAt, completedEnrollmentId: enrollment.id },
    });

    // EL AVISO QUE YA NO PIDE NADA SE APAGA. "Tienes esta formacion asignada" deja de tener
    // sentido en cuanto la formacion esta hecha, y dejarlo sin leer hace que la campana reclame
    // atencion por algo que la persona acaba de terminar.
    //
    // Se marca LEIDO, no se borra: sigue estando en "ver leidas", que es donde se comprueba que a
    // alguien se le aviso y cuando. Un registro que el sistema borra solo es un registro en el que
    // no se puede confiar.
    await db.notification.updateMany({
      where: {
        recipientUserId: enrollment.userId,
        channel: 'IN_APP',
        readAt: null,
        referenceType: 'activities',
        referenceId: enrollment.activityVersion.activityId,
      },
      data: { readAt: completedAt },
    });

    return true;
  }

  private async markStatus(db: TenantPrisma, enrollmentId: string, status: 'IN_PROGRESS' | 'FAILED'): Promise<void> {
    await db.enrollment.update({
      where: { id: enrollmentId },
      data: { status, ...(status === 'IN_PROGRESS' ? { startedAt: new Date() } : {}) },
    });
  }
}
