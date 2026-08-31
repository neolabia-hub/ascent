import { Module } from '@nestjs/common';
import { AssessmentsModule } from '../assessments/assessments.module.js';
import { AuditService } from '../common/audit.service.js';
import { OfferingsModule } from '../offerings/offerings.module.js';
import { ActivitiesController } from './activities.controller.js';
import { ActivitiesService } from './activities.service.js';
import { PublishApprovalRegistrar } from './publish-approval.js';
import { VersioningService } from './versioning.service.js';

@Module({
  imports: [OfferingsModule, AssessmentsModule],
  controllers: [ActivitiesController],
  // PublishApprovalRegistrar se instancia para que su onModuleInit registre el applier de
  // publicacion en el servicio de aprobaciones (sin el, aprobar no publicaria nada).
  providers: [ActivitiesService, VersioningService, PublishApprovalRegistrar, AuditService],
  exports: [VersioningService],
})
export class ActivitiesModule {}
