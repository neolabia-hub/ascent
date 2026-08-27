import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  audienceRuleSchema,
  createAssignmentRuleSchema,
  createAssignmentSchema,
  createAudienceSchema,
  listAssignmentsQuerySchema,
  toggleJobTitleMatrixSchema,
  updateAssignmentRuleSchema,
  updateAudienceSchema,
  waiveAssignmentSchema,
} from '@neo-pulse/shared';
import { CurrentUser, RequirePermissions } from '../common/decorators.js';
import type { AuthUser } from '../common/types.js';
import { AssignmentsService } from './assignments.service.js';
import { AudiencesService } from './audiences.service.js';

/**
 * Obligacion formativa: AUDIENCIAS (a quienes), REQUISITOS (que se les exige) y ASIGNACIONES
 * (la obligacion concreta de cada persona).
 *
 * Definir audiencias es configuracion del tenant (`audiences:manage`); asignar y consultar es
 * gestion diaria (`assignments:manage`, que el Analista si tiene).
 */
@Controller()
export class AssignmentsController {
  constructor(
    private readonly assignments: AssignmentsService,
    private readonly audiences: AudiencesService,
  ) {}

  // ─────────────────────────── Audiencias ───────────────────────────

  @Get('audiences')
  @RequirePermissions('assignments:manage')
  listAudiences() {
    return this.audiences.list();
  }

  @Get('audiences/:id')
  @RequirePermissions('assignments:manage')
  getAudience(@Param('id', ParseUUIDPipe) id: string) {
    return this.audiences.getById(id);
  }

  /** Cuantas personas alcanzaria la regla, ANTES de guardarla. */
  @Post('audiences/preview')
  @RequirePermissions('assignments:manage')
  previewAudience(@Body() body: unknown) {
    return this.audiences.preview(audienceRuleSchema.parse(body));
  }

  @Post('audiences')
  @RequirePermissions('audiences:manage')
  createAudience(@CurrentUser() actor: AuthUser, @Body() body: unknown) {
    return this.audiences.create(actor, createAudienceSchema.parse(body));
  }

  @Patch('audiences/:id')
  @RequirePermissions('audiences:manage')
  updateAudience(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.audiences.update(actor, id, updateAudienceSchema.parse(body));
  }

  @Delete('audiences/:id')
  @RequirePermissions('audiences:manage')
  deactivateAudience(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.audiences.deactivate(actor, id);
  }

  // ─────────────────────────── Requisitos ───────────────────────────

  @Get('assignment-rules')
  @RequirePermissions('assignments:manage')
  listRules() {
    return this.assignments.listRules();
  }

  @Post('assignment-rules')
  @RequirePermissions('assignments:manage')
  createRule(@CurrentUser() actor: AuthUser, @Body() body: unknown) {
    return this.assignments.createRule(actor, createAssignmentRuleSchema.parse(body));
  }

  @Patch('assignment-rules/:id')
  @RequirePermissions('assignments:manage')
  updateRule(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.assignments.updateRule(actor, id, updateAssignmentRuleSchema.parse(body));
  }

  @Get('assignment-rules/job-title-matrix')
  @RequirePermissions('assignments:manage')
  matrix() {
    return this.assignments.jobTitleMatrix();
  }

  @Post('assignment-rules/job-title-matrix')
  @RequirePermissions('assignments:manage')
  toggleMatrix(@CurrentUser() actor: AuthUser, @Body() body: unknown) {
    return this.assignments.toggleJobTitleMatrix(actor, toggleJobTitleMatrixSchema.parse(body));
  }

  // ─────────────────────────── Asignaciones ───────────────────────────

  @Get('assignments')
  @RequirePermissions('assignments:manage')
  list(@Query() query: Record<string, string>) {
    return this.assignments.list(listAssignmentsQuerySchema.parse(query));
  }

  @Post('assignments')
  @RequirePermissions('assignments:manage')
  create(@CurrentUser() actor: AuthUser, @Body() body: unknown) {
    return this.assignments.createManual(actor, createAssignmentSchema.parse(body));
  }

  @Post('assignments/:id/waive')
  @RequirePermissions('assignments:manage')
  waive(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.assignments.waive(actor, id, waiveAssignmentSchema.parse(body));
  }
}
