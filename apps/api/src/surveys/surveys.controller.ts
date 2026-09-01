import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { CurrentUser, RequirePermissions } from '../common/decorators.js';
import type { AuthUser } from '../common/types.js';
import { SurveysService } from './surveys.service.js';

/**
 * ENCUESTAS (Sprint 5, Decision #114).
 *
 * Dos publicos: quien las DISENA —configuracion de la empresa— y quien las RESPONDE, que es
 * cualquiera que termine una formacion. Por eso las rutas de responder cuelgan de `/me`: operan
 * sobre la sesion y no reciben un id de persona, que es lo que impide responder por otro.
 */
@Controller()
export class SurveysController {
  constructor(private readonly surveys: SurveysService) {}

  @Get('survey-templates')
  @RequirePermissions('catalog:read')
  list(@Query('kind') kind?: 'SATISFACTION' | 'EFFICACY') {
    return this.surveys.list(kind);
  }

  @Get('survey-templates/:id')
  @RequirePermissions('catalog:read')
  get(@Param('id') id: string) {
    return this.surveys.get(id);
  }

  @Post('survey-templates')
  @RequirePermissions('catalog:manage_draft')
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.surveys.create(user.tenantId, user.id, body);
  }

  @Put('survey-templates/:id')
  @RequirePermissions('catalog:manage_draft')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.surveys.update(user.tenantId, user.id, id, body);
  }

  @Delete('survey-templates/:id')
  @RequirePermissions('catalog:manage_draft')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.surveys.remove(user.tenantId, user.id, id);
  }

  // ─────────────────────────── Responderla ───────────────────────────

  /** Sin permiso: responder la encuesta de la propia formacion es parte de cursarla. */
  @Get('me/enrollments/:enrollmentId/surveys/:templateId')
  paraResponder(
    @CurrentUser() user: AuthUser,
    @Param('enrollmentId') enrollmentId: string,
    @Param('templateId') templateId: string,
  ) {
    return this.surveys.paraResponder(user.tenantId, user.id, enrollmentId, templateId);
  }

  @Post('me/enrollments/:enrollmentId/surveys/:templateId')
  responder(
    @CurrentUser() user: AuthUser,
    @Param('enrollmentId') enrollmentId: string,
    @Param('templateId') templateId: string,
    @Body() body: unknown,
  ) {
    return this.surveys.responder(user.tenantId, user.id, enrollmentId, templateId, body);
  }
}
