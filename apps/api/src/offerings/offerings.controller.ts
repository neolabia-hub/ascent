import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  adjustProjectedSchema,
  cancelOfferingSchema,
  createOfferingSchema,
  enrollOfferingSchema,
  listOfferingsQuerySchema,
  marcarAsistenciaSchema,
  migrateOfferingVersionSchema,
  previewProjectedSchema,
  publishOfferingSchema,
  updateOfferingSchema,
} from '@neo-pulse/shared';
import { ApprovalsService } from '../approvals/approvals.service.js';
import { CurrentUser, RequirePermissions } from '../common/decorators.js';
import type { AuthUser } from '../common/types.js';
import { APPROVAL_ENTITY_OFFERING } from './offering-approval.js';
import { OfferingsService } from './offerings.service.js';

/**
 * Convocatorias. Programar es gestion diaria (`offerings:manage`); publicar y cancelar
 * comprometen a la organizacion y exigen `offerings:publish` — quien no lo tiene lo PROPONE con
 * justificacion y el Admin decide (mismo patron que publicar contenido).
 */
@Controller('offerings')
export class OfferingsController {
  constructor(
    private readonly offerings: OfferingsService,
    private readonly approvals: ApprovalsService,
  ) {}

  @Get()
  @RequirePermissions('offerings:read')
  list(@CurrentUser() actor: AuthUser, @Query() query: Record<string, string>) {
    return this.offerings.list(actor, listOfferingsQuerySchema.parse(query));
  }

  /**
   * Los proyectados de una convocatoria que TODAVIA NO EXISTE, mientras se marca la tajada.
   * Declarada ANTES de las rutas con `:id` a proposito: un segmento fijo no puede quedar detras
   * de un comodin del mismo nivel.
   */
  @Post('proyectados')
  @RequirePermissions('offerings:read')
  previewProjectedForForm(@Body() body: unknown) {
    return this.offerings.previewProjectedForForm(previewProjectedSchema.parse(body));
  }

  @Get(':id')
  @RequirePermissions('offerings:read')
  getById(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.offerings.getById(actor, id);
  }

  @Get(':id/projected')
  @RequirePermissions('offerings:read')
  projected(@Param('id', ParseUUIDPipe) id: string) {
    return this.offerings.previewProjected(id);
  }

  @Get(':id/roster')
  @RequirePermissions('offerings:read')
  roster(@Param('id', ParseUUIDPipe) id: string) {
    return this.offerings.roster(id);
  }

  /** A quien le falta ser citado a esta jornada: la pregunta "¿ya convoque a todos los mios?". */
  @Get(':id/pendientes-por-convocar')
  @RequirePermissions('offerings:read')
  pendingInvites(@Param('id', ParseUUIDPipe) id: string) {
    return this.offerings.pendingInvites(id);
  }

  /** Que pasaria si se apuntara a la version vigente: a cuantos mueve y a cuantos no. */
  @Get(':id/version-upgrade')
  @RequirePermissions('offerings:read')
  versionUpgrade(@Param('id', ParseUUIDPipe) id: string) {
    return this.offerings.versionUpgrade(id);
  }

  @Post()
  @RequirePermissions('offerings:manage')
  create(@CurrentUser() actor: AuthUser, @Body() body: unknown) {
    return this.offerings.create(actor, createOfferingSchema.parse(body));
  }

  @Patch(':id')
  @RequirePermissions('offerings:manage')
  update(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.offerings.update(actor, id, updateOfferingSchema.parse(body));
  }

  @Post(':id/publish')
  @RequirePermissions('offerings:manage')
  publish(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = publishOfferingSchema.parse(body);
    return this.approvals.requestOrExecute(
      actor,
      'offerings:publish',
      {
        entityType: APPROVAL_ENTITY_OFFERING,
        entityId: id,
        action: 'PUBLISH',
        payload: {
          intent: 'PUBLISH',
          projectedOverride: input.projectedOverride,
          projectedAdjustReason: input.projectedAdjustReason,
        },
        justification: input.justification ?? 'Solicitud de publicacion de convocatoria.',
      },
      () => this.offerings.publish(actor, id, input),
    );
  }

  /**
   * Ajustar los proyectados mueve el DENOMINADOR de la cobertura, asi que pasa por la misma
   * compuerta que publicar: quien no tiene `offerings:publish` lo PROPONE con su motivo.
   */
  @Post(':id/adjust-projected')
  @RequirePermissions('offerings:manage')
  adjustProjected(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = adjustProjectedSchema.parse(body);
    return this.approvals.requestOrExecute(
      actor,
      'offerings:publish',
      {
        entityType: APPROVAL_ENTITY_OFFERING,
        entityId: id,
        action: 'EDIT_PUBLISHED',
        payload: { intent: 'ADJUST_PROJECTED', projectedCount: input.projectedCount, reason: input.reason },
        justification: input.reason,
      },
      () => this.offerings.adjustProjected(actor, id, input),
    );
  }

  @Post(':id/cancel')
  @RequirePermissions('offerings:manage')
  cancel(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = cancelOfferingSchema.parse(body);
    return this.approvals.requestOrExecute(
      actor,
      'offerings:publish',
      {
        entityType: APPROVAL_ENTITY_OFFERING,
        entityId: id,
        action: 'CANCEL_OFFERING',
        payload: { intent: 'CANCEL', cancelledReason: input.cancelledReason },
        justification: input.cancelledReason,
      },
      () => this.offerings.cancel(actor, id, input),
    );
  }

  /**
   * Apuntar la convocatoria a la version vigente. Mueve a gente ya citada, asi que pasa por la
   * misma compuerta que publicar: quien no tiene `offerings:publish` lo PROPONE con justificacion.
   */
  @Post(':id/migrate-version')
  @RequirePermissions('offerings:manage')
  migrateVersion(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = migrateOfferingVersionSchema.parse(body);
    return this.approvals.requestOrExecute(
      actor,
      'offerings:publish',
      {
        entityType: APPROVAL_ENTITY_OFFERING,
        entityId: id,
        action: 'EDIT_PUBLISHED',
        payload: { intent: 'MIGRATE_VERSION', targetVersionId: input.targetVersionId, confirm: true },
        justification: input.justification ?? 'Solicitud de actualizacion a la version vigente.',
      },
      () => this.offerings.migrateVersion(actor, id, input),
    );
  }

  /** Cerrar la jornada: es lo que la cuenta como ejecutada en el plan anual. */
  @Post(':id/complete')
  @RequirePermissions('offerings:manage')
  complete(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.offerings.complete(actor, id);
  }

  @Post(':id/enroll')
  @RequirePermissions('offerings:manage')
  enroll(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.offerings.enroll(actor, id, enrollOfferingSchema.parse(body));
  }

  /**
   * LA LISTA DE ASISTENCIA (Decision #157): la segunda via de dar por cumplida una formacion.
   *
   * Va bajo **`attendance:take`** y no bajo `offerings:manage`, que es lo que parecia natural.
   * El permiso ya existia desde el Sprint 1 sin que nadie lo usara, y existe por una razon que se
   * ve en cuanto se piensa en quien hace este trabajo: **el INSTRUCTOR** (CLAUDE.md 1: *"dicta
   * convocatorias: toma asistencia, firma actas"*). Quien dicta la jornada tiene que poder decir
   * quien vino sin poder ademas programar, publicar ni cancelar convocatorias — que es lo que le
   * daria `offerings:manage`.
   *
   * ADMIN y ANALISTA lo tienen de fabrica, asi que no cambia nada de lo que ya funcionaba.
   */
  @Post(':id/attendance')
  @RequirePermissions('attendance:take')
  attendance(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.offerings.marcarAsistencia(actor, id, marcarAsistenciaSchema.parse(body));
  }
}
