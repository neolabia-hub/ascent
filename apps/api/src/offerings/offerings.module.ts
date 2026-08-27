import { Module } from '@nestjs/common';
import { AuditService } from '../common/audit.service.js';
import { SequenceService } from '../common/sequence.service.js';
import { OfferingApprovalRegistrar } from './offering-approval.js';
import { OfferingsController } from './offerings.controller.js';
import { OfferingsService } from './offerings.service.js';
import { ProjectedAudienceService } from './projected-audience.service.js';

@Module({
  controllers: [OfferingsController],
  // OfferingApprovalRegistrar se instancia para registrar el applier: sin el, aprobar la
  // publicacion de una convocatoria no publicaria nada.
  providers: [OfferingsService, ProjectedAudienceService, OfferingApprovalRegistrar, SequenceService, AuditService],
  exports: [OfferingsService, ProjectedAudienceService],
})
export class OfferingsModule {}
