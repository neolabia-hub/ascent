import { Module } from '@nestjs/common';
import { AuditService } from '../common/audit.service.js';
import { AssessmentsController } from './assessments.controller.js';
import { AssessmentsService } from './assessments.service.js';
import { QuestionsService } from './questions.service.js';

@Module({
  controllers: [AssessmentsController],
  providers: [QuestionsService, AssessmentsService, AuditService],
  exports: [QuestionsService, AssessmentsService],
})
export class AssessmentsModule {}
