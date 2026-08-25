import { Module } from '@nestjs/common';
import { AuditService } from '../common/audit.service.js';
import { LessonsController } from './lessons.controller.js';
import { LessonsService } from './lessons.service.js';

@Module({
  controllers: [LessonsController],
  providers: [LessonsService, AuditService],
})
export class LessonsModule {}
