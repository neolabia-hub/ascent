import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { createLessonSchema, saveCardsSchema, updateLessonSchema } from '@neo-pulse/shared';
import { CurrentUser, RequirePermissions } from '../common/decorators.js';
import type { AuthUser } from '../common/types.js';
import { LessonsService } from './lessons.service.js';

@Controller('lessons')
export class LessonsController {
  constructor(private readonly lessons: LessonsService) {}

  @Get()
  @RequirePermissions('catalog:read')
  list(@Query('status') status?: string) {
    const parsed = status === 'DRAFT' || status === 'PUBLISHED' ? status : undefined;
    return this.lessons.list(parsed);
  }

  @Get(':id')
  @RequirePermissions('catalog:read')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.lessons.getById(id);
  }

  @Post()
  @RequirePermissions('lessons:manage')
  create(@CurrentUser() actor: AuthUser, @Body() body: unknown) {
    return this.lessons.create(actor, createLessonSchema.parse(body));
  }

  @Patch(':id')
  @RequirePermissions('lessons:manage')
  update(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.lessons.update(actor, id, updateLessonSchema.parse(body));
  }

  /** Guarda la pila completa de tarjetas de la leccion. */
  @Put(':id/cards')
  @RequirePermissions('lessons:manage')
  saveCards(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.lessons.saveCards(actor, id, saveCardsSchema.parse(body));
  }

  @Post(':id/duplicate')
  @RequirePermissions('lessons:manage')
  duplicate(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.lessons.duplicate(actor, id);
  }

  @Delete(':id')
  @RequirePermissions('lessons:manage')
  remove(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.lessons.remove(actor, id);
  }
}
