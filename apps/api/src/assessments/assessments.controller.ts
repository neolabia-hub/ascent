import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  createAssessmentSchema,
  createQuestionCategorySchema,
  createQuestionSchema,
  listQuestionsQuerySchema,
  publishAssessmentSchema,
  reviseQuestionSchema,
  updateAssessmentDraftSchema,
} from '@neo-pulse/shared';
import { CurrentUser, RequirePermissions } from '../common/decorators.js';
import type { AuthUser } from '../common/types.js';
import { AssessmentsService } from './assessments.service.js';
import { QuestionsService } from './questions.service.js';

/**
 * Banco de preguntas y evaluaciones. TODO endpoint que devuelva la respuesta correcta exige
 * `questions:manage`: el reproductor de examenes (Sprint 4) usa una vista aparte sin `correct`.
 */
@Controller()
export class AssessmentsController {
  constructor(
    private readonly questions: QuestionsService,
    private readonly assessments: AssessmentsService,
  ) {}

  // ─────────────────────────── Categorias del banco ───────────────────────────

  @Get('question-categories')
  @RequirePermissions('questions:manage')
  listCategories() {
    return this.questions.listCategories();
  }

  @Post('question-categories')
  @RequirePermissions('questions:manage')
  createCategory(@CurrentUser() actor: AuthUser, @Body() body: unknown) {
    const input = createQuestionCategorySchema.parse(body);
    return this.questions.createCategory(actor, input.name, input.parentId ?? null);
  }

  @Delete('question-categories/:id')
  @RequirePermissions('questions:manage')
  deleteCategory(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.questions.deleteCategory(actor, id);
  }

  // ─────────────────────────── Preguntas ───────────────────────────

  @Get('questions')
  @RequirePermissions('questions:manage')
  listQuestions(@Query() query: Record<string, string>) {
    return this.questions.list(listQuestionsQuerySchema.parse(query));
  }

  @Get('questions/:id')
  @RequirePermissions('questions:manage')
  getQuestion(@Param('id', ParseUUIDPipe) id: string) {
    return this.questions.getForEdit(id);
  }

  @Post('questions')
  @RequirePermissions('questions:manage')
  createQuestion(@CurrentUser() actor: AuthUser, @Body() body: unknown) {
    return this.questions.create(actor, createQuestionSchema.parse(body));
  }

  /** Editar NO modifica: crea la version N+1 (los intentos historicos quedan intactos). */
  @Post('questions/:id/revise')
  @RequirePermissions('questions:manage')
  reviseQuestion(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const { payload } = reviseQuestionSchema.parse(body);
    return this.questions.revise(actor, id, payload);
  }

  @Delete('questions/:id')
  @RequirePermissions('questions:manage')
  retireQuestion(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.questions.retire(actor, id);
  }

  // ─────────────────────────── Evaluaciones ───────────────────────────

  @Get('assessments')
  @RequirePermissions('catalog:read')
  listAssessments() {
    return this.assessments.list();
  }

  @Get('assessments/:id')
  @RequirePermissions('catalog:read')
  getAssessment(@Param('id', ParseUUIDPipe) id: string) {
    return this.assessments.getById(id);
  }

  @Post('assessments')
  @RequirePermissions('questions:manage')
  createAssessment(@CurrentUser() actor: AuthUser, @Body() body: unknown) {
    const { title } = createAssessmentSchema.parse(body);
    return this.assessments.create(actor, title);
  }

  @Patch('assessments/versions/:versionId')
  @RequirePermissions('questions:manage')
  updateDraft(
    @CurrentUser() actor: AuthUser,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body() body: unknown,
  ) {
    return this.assessments.updateDraft(actor, versionId, updateAssessmentDraftSchema.parse(body));
  }

  @Post('assessments/versions/:versionId/publish')
  @RequirePermissions('questions:manage')
  publish(@CurrentUser() actor: AuthUser, @Param('versionId', ParseUUIDPipe) versionId: string, @Body() body: unknown) {
    publishAssessmentSchema.parse(body);
    return this.assessments.publish(actor, versionId);
  }

  @Post('assessments/:id/versions')
  @RequirePermissions('questions:manage')
  createNextDraft(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.assessments.createNextDraft(actor, id);
  }
}
