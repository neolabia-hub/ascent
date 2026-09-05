import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { SubmitAttemptInput } from '@neo-pulse/shared';
import { toLearnerView } from '../assessments/question-payload.js';
import type { AuthUser } from '../common/types.js';
import { EngagementService } from '../engagement/engagement.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CompletionService } from './completion.service.js';
import { applyGradingPolicy, detectAnomalies, gradeQuestion, scoreAttempt, type GradingPolicy } from './grading.js';

interface SelectedQuestion {
  questionVersionId: string;
  points: number;
  optionIds: string[];
}

/**
 * EXAMENES. La regla que lo gobierna todo: **la nota se decide en el servidor**. El cliente nunca
 * ve la respuesta correcta, nunca calcula puntaje y nunca decide si aprobo.
 *
 * Cada intento MATERIALIZA su seleccion (Decision #7): que preguntas cayeron, en que orden y con
 * que orden de opciones. Sin eso no se puede anular una pregunta defectuosa y recalificar solo a
 * quienes les toco, que es exactamente lo que se necesita cuando alguien impugna.
 */
@Injectable()
export class AttemptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly completion: CompletionService,
    private readonly engagement: EngagementService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Abre un intento. Antes valida lo que protege la seriedad de la evaluacion: que no este
   * bloqueado, que le queden intentos y que haya cumplido la espera entre ellos.
   */
  async start(actor: AuthUser, enrollmentId: string, assessmentId: string) {
    const tenantId = this.prisma.currentTenantId;
    const enrollment = await this.requireOwn(actor, enrollmentId);
    if (enrollment.blockedAt) {
      throw new ConflictException({
        code: 'ENROLLMENT_BLOCKED',
        message: 'Agotaste los intentos. Tu analista debe habilitarte un refuerzo.',
      });
    }

    const version = await this.prisma.scoped.assessment.findUnique({
      where: { id: assessmentId },
      select: {
        id: true,
        status: true,
        maxAttempts: true,
        passingScore: true,
        timeLimitMin: true,
        shuffleQuestions: true,
        shuffleOptions: true,
        sections: { orderBy: { displayOrder: 'asc' } },
      },
    });
    if (!version) throw new NotFoundException({ code: 'ASSESSMENT_NOT_FOUND' });
    if (version.status !== 'PUBLISHED') throw new ConflictException({ code: 'ASSESSMENT_NOT_PUBLISHED' });

    const previous = await this.prisma.scoped.attempt.findMany({
      where: { enrollmentId, assessmentId },
      orderBy: { attemptNumber: 'asc' },
      select: { id: true, attemptNumber: true, status: true, submittedAt: true, passed: true },
    });

    const open = previous.find((attempt) => attempt.status === 'IN_PROGRESS');
    if (open) return this.view(actor, open.id); // retomar el que quedo a medias, no abrir otro

    if (previous.some((attempt) => attempt.passed)) {
      throw new ConflictException({ code: 'ALREADY_PASSED', message: 'Ya aprobaste esta evaluacion.' });
    }

    const maxAttempts = version.maxAttempts ?? enrollment.activityVersion.maxAttempts;
    if (previous.length >= maxAttempts) {
      throw new ConflictException({ code: 'NO_ATTEMPTS_LEFT', maxAttempts });
    }

    const waitHours = enrollment.activityVersion.retryWaitHours;
    const last = previous[previous.length - 1];
    if (waitHours && last?.submittedAt) {
      const availableAt = new Date(last.submittedAt.getTime() + waitHours * 60 * 60 * 1000);
      if (new Date() < availableAt) {
        throw new ConflictException({ code: 'RETRY_TOO_SOON', availableAt });
      }
    }

    const selected = await this.selectQuestions(version.sections, version.shuffleQuestions, version.shuffleOptions);
    if (selected.length === 0) throw new ConflictException({ code: 'ASSESSMENT_EMPTY' });

    const attempt = await this.prisma.tx(async (tx) => {
      const created = await tx.attempt.create({
        data: {
          tenantId,
          enrollmentId,
          assessmentId,
          userId: actor.id,
          attemptNumber: previous.length + 1,
          status: 'IN_PROGRESS',
        },
      });
      await tx.attemptQuestion.createMany({
        data: selected.map((question, index) => ({
          tenantId,
          attemptId: created.id,
          questionVersionId: question.questionVersionId,
          displayOrder: index,
          optionsOrder: question.optionIds as Prisma.InputJsonValue,
          pointsPossible: question.points,
        })),
      });
      return created;
    });

    await this.prisma.scoped.learningEvent.create({
      data: {
        tenantId,
        userId: actor.id,
        enrollmentId,
        verb: 'LAUNCHED',
        objectType: 'assessment_versions',
        objectId: assessmentId,
        result: { attemptNumber: attempt.attemptNumber } as Prisma.InputJsonValue,
      },
    });
    return this.view(actor, attempt.id);
  }

  /** El intento tal como lo ve quien lo responde: sin respuestas correctas, en su orden. */
  async view(actor: AuthUser, attemptId: string) {
    const attempt = await this.requireOwnAttempt(actor, attemptId);
    const questions = await this.prisma.scoped.attemptQuestion.findMany({
      where: { attemptId, invalidated: false },
      orderBy: { displayOrder: 'asc' },
      select: {
        id: true,
        displayOrder: true,
        optionsOrder: true,
        answer: true,
        pointsPossible: true,
        questionVersion: {
          select: { id: true, qtype: true, stem: true, options: true, correct: true, feedback: true, points: true },
        },
      },
    });

    return {
      attempt: {
        id: attempt.id,
        attemptNumber: attempt.attemptNumber,
        status: attempt.status,
        startedAt: attempt.startedAt,
        timeLimitMin: attempt.assessment.timeLimitMin,
        presentation: attempt.assessment.source?.presentation ?? attempt.assessment.presentation,
      },
      questions: questions.map((row) => {
        const learner = toLearnerView(row.questionVersion);
        return {
          attemptQuestionId: row.id,
          ...learner,
          // Se respeta el orden de opciones barajado para ESTE intento (en FILL_BLANK no hay
          // barajado que aplicar: sus "opciones" son los huecos y se sirven en su orden).
          options: this.applyOptionOrder(learner.options, row.optionsOrder),
          answer: row.answer,
          pointsPossible: Number(row.pointsPossible),
        };
      }),
    };
  }

  /** Guarda una respuesta sin calificar: permite responder por partes y sin senal estable. */
  async saveAnswer(actor: AuthUser, attemptId: string, attemptQuestionId: string, answer: unknown) {
    const attempt = await this.requireOwnAttempt(actor, attemptId);
    if (attempt.status !== 'IN_PROGRESS') throw new ConflictException({ code: 'ATTEMPT_CLOSED' });

    const updated = await this.prisma.scoped.attemptQuestion.updateMany({
      where: { id: attemptQuestionId, attemptId },
      data: { answer: answer as Prisma.InputJsonValue },
    });
    if (updated.count === 0) throw new NotFoundException({ code: 'ATTEMPT_QUESTION_NOT_FOUND' });
    return { ok: true as const };
  }

  /**
   * Entrega y califica. Aqui se decide todo: la nota, si aprobo, si agoto los intentos (y
   * entonces se bloquea y se avisa para refuerzo) y que preguntas fallo (que vuelven a la cola
   * de repaso).
   */
  async submit(actor: AuthUser, attemptId: string, input: SubmitAttemptInput) {
    const tenantId = this.prisma.currentTenantId;
    const attempt = await this.requireOwnAttempt(actor, attemptId);
    if (attempt.status !== 'IN_PROGRESS') throw new ConflictException({ code: 'ATTEMPT_CLOSED' });

    // Las respuestas que llegan con la entrega (telefono que sincroniza al final) se guardan.
    for (const answer of input.answers) {
      await this.prisma.scoped.attemptQuestion.updateMany({
        where: { id: answer.attemptQuestionId, attemptId },
        data: { answer: answer.answer as Prisma.InputJsonValue },
      });
    }

    const rows = await this.prisma.scoped.attemptQuestion.findMany({
      where: { attemptId },
      select: {
        id: true,
        answer: true,
        pointsPossible: true,
        invalidated: true,
        questionVersionId: true,
        questionVersion: { select: { qtype: true, correct: true } },
      },
    });

    const failed: string[] = [];
    const graded = [];
    for (const row of rows) {
      if (row.invalidated) {
        graded.push({ pointsPossible: Number(row.pointsPossible), pointsAwarded: null, invalidated: true });
        continue;
      }
      const grade = gradeQuestion(
        {
          qtype: row.questionVersion.qtype,
          correct: row.questionVersion.correct,
          pointsPossible: Number(row.pointsPossible),
        },
        row.answer,
      );
      await this.prisma.scoped.attemptQuestion.update({
        where: { id: row.id },
        data: { pointsAwarded: grade.pointsAwarded, gradedAt: grade.needsManualGrading ? null : new Date() },
      });
      if (!grade.needsManualGrading && !grade.correct) failed.push(row.questionVersionId);
      graded.push({
        pointsPossible: Number(row.pointsPossible),
        pointsAwarded: grade.pointsAwarded,
        invalidated: false,
      });
    }

    const passingScore = attempt.assessment.passingScore ?? attempt.enrollment.activityVersion.passingScore;
    const result = scoreAttempt(graded, passingScore);
    const submittedAt = new Date();
    const anomalies = detectAnomalies(
      Math.round((submittedAt.getTime() - attempt.startedAt.getTime()) / 1000),
      rows.filter((row) => !row.invalidated).length,
    );

    await this.prisma.scoped.attempt.update({
      where: { id: attemptId },
      data: {
        status: result.pending ? 'PENDING_MANUAL' : 'GRADED',
        submittedAt,
        score: result.pending ? null : result.score,
        passed: result.pending ? null : result.passed,
        anomalyFlags: anomalies.tooFast ? (anomalies as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });

    // Lo fallado vuelve: es el corazon de la retencion (Decision #22).
    await this.engagement.recordFailures(this.prisma.scoped, tenantId, actor.id, attempt.enrollmentId, failed);

    if (result.pending) {
      return { status: 'PENDING_MANUAL' as const, score: null, passed: null, blocked: false };
    }

    await this.applyFinalScore(actor, attempt.enrollmentId, attempt.assessmentId);
    if (result.passed) {
      await this.engagement.awardAssessmentPassed(this.prisma.scoped, tenantId, actor.id, attemptId);
    }

    const blocked = result.passed ? false : await this.blockIfExhausted(actor, attempt);
    const completion = await this.completion.evaluate(attempt.enrollmentId);

    await this.prisma.scoped.learningEvent.create({
      data: {
        tenantId,
        userId: actor.id,
        enrollmentId: attempt.enrollmentId,
        verb: result.passed ? 'PASSED' : 'FAILED',
        objectType: 'attempts',
        objectId: attemptId,
        result: { score: result.score, tooFast: anomalies.tooFast } as Prisma.InputJsonValue,
      },
    });

    return { status: 'GRADED' as const, score: result.score, passed: result.passed, blocked, completion };
  }

  /**
   * Que puede ver la persona despues de entregar. Lo gobierna la politica de revision de la
   * evaluacion: con un banco reutilizado, mostrar las respuestas correctas a todo el mundo
   * equivale a publicar el examen.
   */
  async review(actor: AuthUser, attemptId: string) {
    const attempt = await this.requireOwnAttempt(actor, attemptId);
    if (attempt.status === 'IN_PROGRESS') throw new ConflictException({ code: 'ATTEMPT_NOT_SUBMITTED' });

    const policy = (attempt.assessment.reviewPolicy ?? {}) as {
      showScore?: boolean;
      showCorrectAnswers?: boolean;
      showExplanations?: boolean;
      onlyAfterLastAttempt?: boolean;
    };
    const showScore = policy.showScore ?? true;

    const attemptsUsed = await this.prisma.scoped.attempt.count({
      where: { enrollmentId: attempt.enrollmentId, assessmentId: attempt.assessmentId },
    });
    const maxAttempts = attempt.assessment.maxAttempts ?? attempt.enrollment.activityVersion.maxAttempts;
    const isLast = attempt.passed === true || attemptsUsed >= maxAttempts;
    const detailAllowed = !(policy.onlyAfterLastAttempt ?? true) || isLast;

    const rows = await this.prisma.scoped.attemptQuestion.findMany({
      where: { attemptId },
      orderBy: { displayOrder: 'asc' },
      select: {
        id: true,
        pointsPossible: true,
        pointsAwarded: true,
        invalidated: true,
        questionVersion: { select: { stem: true, correct: true, feedback: true } },
      },
    });

    return {
      score: showScore ? Number(attempt.score ?? 0) : null,
      passed: attempt.passed,
      attemptsUsed,
      maxAttempts,
      detail: detailAllowed
        ? rows.map((row) => ({
            stem: row.questionVersion.stem,
            invalidated: row.invalidated,
            pointsAwarded: row.pointsAwarded === null ? null : Number(row.pointsAwarded),
            pointsPossible: Number(row.pointsPossible),
            correct: policy.showCorrectAnswers ? row.questionVersion.correct : null,
            explanation: (policy.showExplanations ?? true)
              ? ((row.questionVersion.feedback as { explanation?: string | null } | null)?.explanation ?? null)
              : null,
          }))
        : [],
    };
  }

  // ─────────────────────────── Apoyo ───────────────────────────

  /** Nota final de la ejecucion segun la politica (por defecto, la mas alta de los intentos). */
  private async applyFinalScore(actor: AuthUser, enrollmentId: string, assessmentId: string): Promise<void> {
    const version = await this.prisma.scoped.assessment.findUnique({
      where: { id: assessmentId },
      select: { gradingPolicy: true },
    });
    const graded = await this.prisma.scoped.attempt.findMany({
      where: { enrollmentId, assessmentId, status: 'GRADED' },
      select: { attemptNumber: true, score: true, passed: true },
    });
    const outcome = applyGradingPolicy(
      graded.map((attempt) => ({
        attemptNumber: attempt.attemptNumber,
        score: Number(attempt.score ?? 0),
        passed: Boolean(attempt.passed),
      })),
      (version?.gradingPolicy ?? 'HIGHEST') as GradingPolicy,
    );
    if (!outcome) return;
    await this.prisma.scoped.enrollment.update({ where: { id: enrollmentId }, data: { finalScore: outcome.score } });
  }

  /**
   * Intentos agotados: la ejecucion se BLOQUEA y se avisa al responsable del proceso y al jefe
   * del area para que haya refuerzo (negocio 3.6). El indicador no se infla solo: queda como no
   * conforme hasta que alguien lo rehabilite de forma explicita y auditada.
   */
  private async blockIfExhausted(
    actor: AuthUser,
    attempt: { id: string; enrollmentId: string; assessmentId: string; assessment: { maxAttempts: number | null }; enrollment: { activityVersion: { maxAttempts: number; activityId: string } } },
  ): Promise<boolean> {
    const tenantId = this.prisma.currentTenantId;
    const maxAttempts = attempt.assessment.maxAttempts ?? attempt.enrollment.activityVersion.maxAttempts;
    const used = await this.prisma.scoped.attempt.count({
      where: { enrollmentId: attempt.enrollmentId, assessmentId: attempt.assessmentId },
    });
    if (used < maxAttempts) return false;

    await this.prisma.scoped.enrollment.update({
      where: { id: attempt.enrollmentId },
      data: { blockedAt: new Date(), blockedReason: `Intentos agotados (${used} de ${maxAttempts})` },
    });

    const person = await this.prisma.scoped.user.findUnique({
      where: { id: actor.id },
      select: { fullName: true, area: { select: { name: true, responsibleUserId: true } } },
    });
    const activity = await this.prisma.scoped.activity.findUnique({
      where: { id: attempt.enrollment.activityVersion.activityId },
      select: { name: true, process: { select: { responsibleUserId: true } } },
    });

    const recipients = [activity?.process.responsibleUserId, person?.area.responsibleUserId].filter(
      (id): id is string => Boolean(id),
    );
    const targets = await this.prisma.scoped.user.findMany({
      where: { id: { in: [...new Set(recipients)] } },
      select: { id: true, email: true },
    });
    for (const target of targets) {
      await this.notifications.notify(tenantId, {
        eventType: 'ATTEMPTS_EXHAUSTED',
        recipientUserId: target.id,
        recipientEmail: target.email,
        subject: 'Alguien agoto los intentos de una evaluacion',
        body: `${person?.fullName ?? 'Un colaborador'} (${person?.area.name ?? 'sin area'}) agoto los ${maxAttempts} intentos de ${activity?.name ?? 'una formacion'}. Requiere refuerzo.`,
        // Apunta a la FORMACION y no a la inscripcion: la referencia de un aviso existe para
        // llevar a quien lo lee a donde puede hacer algo, y de una inscripcion ajena no hay
        // pantalla. El rastro exacto (que inscripcion, que intento) queda en la auditoria.
        referenceType: 'activities',
        referenceId: attempt.enrollment.activityVersion.activityId,
      });
    }
    return true;
  }

  /** Arma la seleccion del intento: secciones fijas y aleatorias, con barajado. */
  private async selectQuestions(
    sections: Array<{ mode: string; categoryId: string | null; pickCount: number | null; fixedQuestionVersionIds: string[] }>,
    shuffleQuestions: boolean,
    shuffleOptions: boolean,
  ): Promise<SelectedQuestion[]> {
    const selectedIds: string[] = [];

    for (const section of sections) {
      if (section.mode === 'FIXED') {
        selectedIds.push(...section.fixedQuestionVersionIds);
        continue;
      }
      if (!section.categoryId || !section.pickCount) continue;

      // Se toma de las versiones VIGENTES de las preguntas activas de la categoria.
      const pool = await this.prisma.scoped.question.findMany({
        where: { categoryId: section.categoryId, active: true, currentVersionId: { not: null } },
        select: { currentVersionId: true },
      });
      const poolIds = pool
        .map((question) => question.currentVersionId)
        .filter((id): id is string => Boolean(id));
      selectedIds.push(...this.shuffle(poolIds).slice(0, section.pickCount));
    }

    const unique = [...new Set(selectedIds)];
    if (unique.length === 0) return [];

    const versions = await this.prisma.scoped.questionVersion.findMany({
      where: { id: { in: unique } },
      select: { id: true, qtype: true, options: true, points: true },
    });
    const ordered = shuffleQuestions ? this.shuffle(versions) : versions;

    return ordered.map((version) => {
      const options = (Array.isArray(version.options) ? version.options : []) as Array<{ id: string }>;
      const optionIds = options.map((option) => option.id);
      /*
        EL BARAJADO NO ES LA MISMA DECISION PARA TODOS LOS TIPOS (Decision #86). "Barajar
        opciones" es una preferencia del administrador, pero en dos tipos deja de serlo:

          ORDER y MATCH  SIEMPRE se barajan, elija lo que elija. Servir los pasos en su orden
                         correcto, o las dos columnas alineadas, es dar la respuesta hecha: se
                         responde sin leer, pulsando "siguiente".
          FILL_BLANK     NUNCA se baraja. Aqui las "opciones" son los HUECOS del enunciado, en el
                         orden en que aparecen; moverlos escribiria la respuesta del hueco 2 en el
                         hueco 1 y suspenderia a quien acerto.
      */
      const barajar =
        version.qtype === 'ORDER' || version.qtype === 'MATCH'
          ? true
          : version.qtype === 'FILL_BLANK'
            ? false
            : shuffleOptions;
      return {
        questionVersionId: version.id,
        points: Number(version.points),
        optionIds: barajar ? this.shuffle(optionIds) : optionIds,
      };
    });
  }

  /** Fisher-Yates. Barajar por intento es lo que hace que pasarse la hoja de respuestas no sirva. */
  private shuffle<T>(items: T[]): T[] {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swap]] = [copy[swap] as T, copy[index] as T];
    }
    return copy;
  }

  private applyOptionOrder(options: Array<{ id: string; text: string }>, order: Prisma.JsonValue) {
    const ids = Array.isArray(order) ? (order as string[]) : [];
    if (ids.length === 0) return options;
    const byId = new Map(options.map((option) => [option.id, option]));
    return ids.map((id) => byId.get(id)).filter((option): option is { id: string; text: string } => Boolean(option));
  }

  private async requireOwn(actor: AuthUser, enrollmentId: string) {
    const enrollment = await this.prisma.scoped.enrollment.findUnique({
      where: { id: enrollmentId },
      select: {
        id: true,
        userId: true,
        blockedAt: true,
        activityVersion: { select: { maxAttempts: true, passingScore: true, retryWaitHours: true, activityId: true } },
      },
    });
    if (!enrollment) throw new NotFoundException({ code: 'ENROLLMENT_NOT_FOUND' });
    if (enrollment.userId !== actor.id) throw new ForbiddenException({ code: 'NOT_YOUR_ENROLLMENT' });
    return enrollment;
  }

  private async requireOwnAttempt(actor: AuthUser, attemptId: string) {
    const attempt = await this.prisma.scoped.attempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        userId: true,
        enrollmentId: true,
        assessmentId: true,
        attemptNumber: true,
        status: true,
        startedAt: true,
        score: true,
        passed: true,
        assessment: {
          select: {
            timeLimitMin: true,
            passingScore: true,
            maxAttempts: true,
            reviewPolicy: true,
            presentation: true,
            /*
              COMO SE VE el examen (Decision #85), leido del ORIGEN si esta es una copia congelada.

              El acento y la transicion no son evidencia —no cambian que se pregunto ni como se
              califico—, asi que retocarlos tiene que llegar tambien a quien ya esta cursando. Si
              se leyera solo de la copia, cambiar un color obligaria a publicar la formacion otra
              vez, que es justo la rigidez que la Decision #87 vino a quitar.
            */
            source: { select: { presentation: true } },
          },
        },
        enrollment: {
          select: { activityVersion: { select: { passingScore: true, maxAttempts: true, activityId: true } } },
        },
      },
    });
    if (!attempt) throw new NotFoundException({ code: 'ATTEMPT_NOT_FOUND' });
    if (attempt.userId !== actor.id) throw new ForbiddenException({ code: 'NOT_YOUR_ATTEMPT' });
    return attempt;
  }
}
