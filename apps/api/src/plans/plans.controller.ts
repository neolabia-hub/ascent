import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  addPlanItemSchema,
  approvePlanSchema,
  createTrainingPlanSchema,
  deletePlanSchema,
  listPlansQuerySchema,
  updatePlanItemSchema,
  updateTrainingPlanSchema,
} from '@neo-pulse/shared';
import { CurrentUser, RequirePermissions } from '../common/decorators.js';
import type { AuthUser } from '../common/types.js';
import { PlansService } from './plans.service.js';

/**
 * Plan de capacitacion anual. Armarlo es gestion (`plans:manage`); APROBARLO exige
 * `plans:approve`, porque congela los proyectados y crea obligaciones para toda la empresa.
 */
@Controller('plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  @RequirePermissions('plans:manage')
  list(@Query() query: Record<string, string>) {
    return this.plans.list(listPlansQuerySchema.parse(query));
  }

  @Get(':id')
  @RequirePermissions('plans:manage')
  getById(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.plans.getById(actor, id);
  }

  @Post()
  @RequirePermissions('plans:manage')
  create(@CurrentUser() actor: AuthUser, @Body() body: unknown) {
    return this.plans.create(actor, createTrainingPlanSchema.parse(body));
  }

  @Patch(':id')
  @RequirePermissions('plans:manage')
  update(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.plans.update(actor, id, updateTrainingPlanSchema.parse(body));
  }

  /**
   * Borrar el plan. `plans:approve` y no `plans:manage`: puede revocar de una vez las
   * obligaciones de mucha gente, y eso pesa lo mismo que crearlas.
   */
  @Delete(':id')
  @RequirePermissions('plans:approve')
  remove(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.plans.remove(actor, id, deletePlanSchema.parse(body));
  }

  @Post(':id/items')
  @RequirePermissions('plans:manage')
  addItem(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.plans.addItem(actor, id, addPlanItemSchema.parse(body));
  }

  @Patch('items/:itemId')
  @RequirePermissions('plans:manage')
  updateItem(@CurrentUser() actor: AuthUser, @Param('itemId', ParseUUIDPipe) itemId: string, @Body() body: unknown) {
    return this.plans.updateItem(actor, itemId, updatePlanItemSchema.parse(body));
  }

  @Delete('items/:itemId')
  @RequirePermissions('plans:manage')
  removeItem(@CurrentUser() actor: AuthUser, @Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.plans.removeItem(actor, itemId);
  }

  @Post(':id/approve')
  @RequirePermissions('plans:approve')
  approve(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.plans.approve(actor, id, approvePlanSchema.parse(body));
  }

  @Post(':id/activate')
  @RequirePermissions('plans:approve')
  activate(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.plans.changeStatus(actor, id, 'ACTIVE');
  }

  @Post(':id/close')
  @RequirePermissions('plans:approve')
  close(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.plans.changeStatus(actor, id, 'CLOSED');
  }
}
