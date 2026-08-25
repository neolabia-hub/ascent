import { Module } from '@nestjs/common';
import { AuditService } from '../common/audit.service.js';
import { ActivitiesController } from './activities.controller.js';
import { ActivitiesService } from './activities.service.js';
import { VersioningService } from './versioning.service.js';

@Module({
  controllers: [ActivitiesController],
  providers: [ActivitiesService, VersioningService, AuditService],
  exports: [VersioningService],
})
export class ActivitiesModule {}
