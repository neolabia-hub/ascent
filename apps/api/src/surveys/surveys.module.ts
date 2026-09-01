import { Module } from '@nestjs/common';
import { AuditService } from '../common/audit.service.js';
import { SurveysController } from './surveys.controller.js';
import { SurveysService } from './surveys.service.js';

/** Encuestas de satisfaccion y de eficacia (Sprint 5). */
@Module({
  controllers: [SurveysController],
  providers: [SurveysService, AuditService],
  exports: [SurveysService],
})
export class SurveysModule {}
