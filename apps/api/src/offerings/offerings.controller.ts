import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  cancelOfferingSchema,
  createOfferingSchema,
  enrollOfferingSchema,
  listOfferingsQuerySchema,
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
  list(@Query() query: Record<string, string>) {
    return this.offerings.list(listOfferingsQuerySchema.parse(query));
  }

  @Get(':id')
  @RequirePermissions('offerings:read')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.offerings.getById(id);
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
}
