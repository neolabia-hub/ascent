import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  createAssessmentSchema,
  createQuestionCategorySchema,
  createQuestionSchema,
  listQuestionsQuerySchema,
  reviseQuestionSchema,
  setQuestionCategorySchema,
  updateAssessmentDraftSchema,
  updatePresentationSchema,
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
  @Patch('questions/:id/category')
  @RequirePermissions('questions:manage')
  setQuestionCategory(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const { categoryId } = setQuestionCategorySchema.parse(body);
    return this.questions.setCategory(actor, id, categoryId);
  }

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

  /**
   * El lienzo de armado necesita la pregunta ENTERA para pintarla y editarla en su sitio, pero
   * este endpoint es `catalog:read` y por ahi tambien entra quien solo esta mirando el catalogo.
   * Asi que `correct` viaja SOLO si ademas puede editar el banco.
   */
  @Get('assessments/:id')
  @RequirePermissions('catalog:read')
  getAssessment(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.assessments.getById(id, actor.hasPermission('questions:manage'));
  }

  @Patch('assessments/:id/presentation')
  @RequirePermissions('questions:manage')
  updatePresentation(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const { presentation } = updatePresentationSchema.parse(body);
    return this.assessments.updatePresentation(actor, id, presentation);
  }

  @Post('assessments')
  @RequirePermissions('questions:manage')
  createAssessment(@CurrentUser() actor: AuthUser, @Body() body: unknown) {
    const { title } = createAssessmentSchema.parse(body);
    return this.assessments.create(actor, title);
  }

  /**
   * GUARDAR. Ya no hay borrador ni publicacion propia de la evaluacion (Decision #87): se edita
   * siempre, y lo que congela una copia es publicar la FORMACION. Por eso desaparecieron
   * `publish`, `discardDraft` y `createNextDraft`: eran la segunda escalera de versiones.
   */
  @Patch('assessments/:id')
  @RequirePermissions('questions:manage')
  updateAssessment(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.assessments.update(actor, id, updateAssessmentDraftSchema.parse(body));
  }

  @Delete('assessments/:id')
  @RequirePermissions('questions:manage')
  removeAssessment(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.assessments.remove(actor, id);
  }
}
