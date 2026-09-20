import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { progressSchema, saveAnswerSchema, selfEnrollSchema, submitAttemptSchema, submitReviewSchema } from '@neo-pulse/shared';
import { CurrentUser, RequirePermissions } from '../common/decorators.js';
import type { AuthUser } from '../common/types.js';
import { EngagementService } from '../engagement/engagement.service.js';
import { ProgramsService } from '../programs/programs.service.js';
import { AttemptsService } from './attempts.service.js';
import { LearnerService } from './learner.service.js';
import { PlayerService } from './player.service.js';

/**
 * LO MIO. Todo lo de aqui exige `enrollments:read_own`, el unico permiso que tiene el rol
 * Usuario, y ademas cada operacion comprueba que lo pedido pertenece a quien lo pide: el permiso
 * habilita el area, no da acceso a lo de los demas.
 */
@Controller('me')
export class LearningController {
  constructor(
    private readonly learner: LearnerService,
    private readonly player: PlayerService,
    private readonly attempts: AttemptsService,
    private readonly engagement: EngagementService,
    private readonly programs: ProgramsService,
  ) {}

  // ─────────────────────────── Mis pendientes e historial ───────────────────────────

  @Get('pending')
  @RequirePermissions('enrollments:read_own')
  pending(@CurrentUser() actor: AuthUser) {
    return this.learner.pending(actor);
  }

  /**
   * MIS PROGRAMAS (2026-09-14): un programa aparece con TODOS sus modulos y cual esta aprobado,
   * no como formaciones sueltas — es justo lo que se pidio: "el usuario tambien lo debe ver asi,
   * un solo programa con modulos".
   */
  @Get('programas')
  @RequirePermissions('enrollments:read_own')
  misProgramas(@CurrentUser() actor: AuthUser) {
    return this.programs.misProgramas(actor.id);
  }

  @Get('history')
  @RequirePermissions('enrollments:read_own')
  history(@CurrentUser() actor: AuthUser) {
    return this.learner.history(actor);
  }

  @Get('progress')
  @RequirePermissions('enrollments:read_own')
  progress(@CurrentUser() actor: AuthUser) {
    return this.engagement.myProgress(actor.id);
  }

  /** Empezar por cuenta propia una formacion de autoservicio. */
  @Post('enroll')
  @RequirePermissions('enrollments:read_own')
  selfEnroll(@CurrentUser() actor: AuthUser, @Body() body: unknown) {
    return this.learner.selfEnroll(actor, selfEnrollSchema.parse(body));
  }

  // ─────────────────────────── Reproductor ───────────────────────────

  @Get('enrollments/:id')
  @RequirePermissions('enrollments:read_own')
  openEnrollment(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.player.openEnrollment(actor, id);
  }

  @Get('contents/:contentId')
  @RequirePermissions('enrollments:read_own')
  content(@CurrentUser() actor: AuthUser, @Param('contentId', ParseUUIDPipe) contentId: string) {
    return this.player.getContent(actor, contentId);
  }

  /** Telemetria del avance. Acumulativa e idempotente: se puede reenviar sin miedo. */
  @Post('contents/:contentId/progress')
  @RequirePermissions('enrollments:read_own')
  saveProgress(
    @CurrentUser() actor: AuthUser,
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Body() body: unknown,
  ) {
    return this.player.saveProgress(actor, contentId, progressSchema.parse(body));
  }

  // ─────────────────────────── Evaluaciones ───────────────────────────

  @Post('enrollments/:id/attempts')
  @RequirePermissions('enrollments:read_own')
  startAttempt(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('assessmentId', ParseUUIDPipe) assessmentId: string,
  ) {
    return this.attempts.start(actor, id, assessmentId);
  }

  @Get('attempts/:attemptId')
  @RequirePermissions('enrollments:read_own')
  viewAttempt(@CurrentUser() actor: AuthUser, @Param('attemptId', ParseUUIDPipe) attemptId: string) {
    return this.attempts.view(actor, attemptId);
  }

  @Post('attempts/:attemptId/answers')
  @RequirePermissions('enrollments:read_own')
  saveAnswer(@CurrentUser() actor: AuthUser, @Param('attemptId', ParseUUIDPipe) attemptId: string, @Body() body: unknown) {
    const input = saveAnswerSchema.parse(body);
    return this.attempts.saveAnswer(actor, attemptId, input.attemptQuestionId, input.answer);
  }

  @Post('attempts/:attemptId/submit')
  @RequirePermissions('enrollments:read_own')
  submitAttempt(@CurrentUser() actor: AuthUser, @Param('attemptId', ParseUUIDPipe) attemptId: string, @Body() body: unknown) {
    return this.attempts.submit(actor, attemptId, submitAttemptSchema.parse(body));
  }

  @Get('attempts/:attemptId/review')
  @RequirePermissions('enrollments:read_own')
  reviewAttempt(@CurrentUser() actor: AuthUser, @Param('attemptId', ParseUUIDPipe) attemptId: string) {
    return this.attempts.review(actor, attemptId);
  }

  // ─────────────────────────── Repaso espaciado ───────────────────────────

  @Get('review')
  @RequirePermissions('enrollments:read_own')
  todayReview(@CurrentUser() actor: AuthUser) {
    return this.engagement.todayReview(actor.id);
  }

  @Post('review')
  @RequirePermissions('enrollments:read_own')
  answerReview(@CurrentUser() actor: AuthUser, @Body() body: unknown) {
    return this.engagement.answerReview(actor.id, submitReviewSchema.parse(body));
  }
}
