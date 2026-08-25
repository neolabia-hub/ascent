import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  createActivitySchema,
  createContentSchema,
  listActivitiesQuerySchema,
  publishVersionSchema,
  reorderContentsSchema,
  updateActivitySchema,
  updateContentSchema,
  updateVersionSettingsSchema,
} from '@neo-pulse/shared';
import { CurrentUser, RequirePermissions } from '../common/decorators.js';
import type { AuthUser } from '../common/types.js';
import { ActivitiesService } from './activities.service.js';
import { VersioningService } from './versioning.service.js';

/**
 * Catalogo formativo. Lectura con `catalog:read`; borradores con `catalog:manage_draft`;
 * publicar exige `catalog:publish` (que el Analista NO tiene: pasa por aprobacion del Admin).
 */
@Controller('activities')
export class ActivitiesController {
  constructor(
    private readonly activities: ActivitiesService,
    private readonly versioning: VersioningService,
  ) {}

  @Get()
  @RequirePermissions('catalog:read')
  list(@Query() query: Record<string, string>) {
    return this.activities.list(listActivitiesQuerySchema.parse(query));
  }

  @Get(':id')
  @RequirePermissions('catalog:read')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.activities.getById(id);
  }

  @Post()
  @RequirePermissions('catalog:manage_draft')
  create(@CurrentUser() actor: AuthUser, @Body() body: unknown) {
    return this.activities.create(actor, createActivitySchema.parse(body));
  }

  @Patch(':id')
  @RequirePermissions('catalog:manage_draft')
  update(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.activities.update(actor, id, updateActivitySchema.parse(body));
  }

  @Delete(':id')
  @RequirePermissions('catalog:manage_draft')
  remove(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.activities.softDelete(actor, id);
  }

  // ─────────────────────────── Versiones ───────────────────────────

  @Get('versions/:versionId')
  @RequirePermissions('catalog:read')
  getVersion(@Param('versionId', ParseUUIDPipe) versionId: string) {
    return this.versioning.getVersion(versionId);
  }

  @Patch('versions/:versionId/settings')
  @RequirePermissions('catalog:manage_draft')
  updateVersionSettings(
    @CurrentUser() actor: AuthUser,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body() body: unknown,
  ) {
    return this.versioning.updateDraftSettings(actor, versionId, updateVersionSettingsSchema.parse(body));
  }

  /** Publicar CONGELA la version: operacion irreversible, por eso exige confirmacion explicita. */
  @Post('versions/:versionId/publish')
  @RequirePermissions('catalog:publish')
  publish(@CurrentUser() actor: AuthUser, @Param('versionId', ParseUUIDPipe) versionId: string, @Body() body: unknown) {
    return this.versioning.publish(actor, versionId, publishVersionSchema.parse(body));
  }

  /** Editar lo publicado = nacer la version N+1 en borrador. La publicada no se toca. */
  @Post(':id/versions')
  @RequirePermissions('catalog:manage_draft')
  createNextDraft(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.versioning.createNextDraft(actor, id);
  }

  @Delete('versions/:versionId')
  @RequirePermissions('catalog:manage_draft')
  discardDraft(@CurrentUser() actor: AuthUser, @Param('versionId', ParseUUIDPipe) versionId: string) {
    return this.versioning.discardDraft(actor, versionId);
  }

  // ─────────────────────────── Contenidos del borrador ───────────────────────────

  @Post('versions/:versionId/contents')
  @RequirePermissions('catalog:manage_draft')
  addContent(
    @CurrentUser() actor: AuthUser,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body() body: unknown,
  ) {
    return this.activities.addContent(actor, versionId, createContentSchema.parse(body));
  }

  @Post('versions/:versionId/contents/reorder')
  @RequirePermissions('catalog:manage_draft')
  reorder(@CurrentUser() actor: AuthUser, @Param('versionId', ParseUUIDPipe) versionId: string, @Body() body: unknown) {
    const { orderedIds } = reorderContentsSchema.parse(body);
    return this.activities.reorderContents(actor, versionId, orderedIds);
  }

  @Patch('contents/:contentId')
  @RequirePermissions('catalog:manage_draft')
  updateContent(
    @CurrentUser() actor: AuthUser,
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Body() body: unknown,
  ) {
    return this.activities.updateContent(actor, contentId, updateContentSchema.parse(body));
  }

  @Delete('contents/:contentId')
  @RequirePermissions('catalog:manage_draft')
  removeContent(@CurrentUser() actor: AuthUser, @Param('contentId', ParseUUIDPipe) contentId: string) {
    return this.activities.removeContent(actor, contentId);
  }
}
