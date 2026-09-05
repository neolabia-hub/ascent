import { Module } from '@nestjs/common';
import { AuditService } from '../common/audit.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PerformanceController } from './performance.controller.js';
import { PerformanceService } from './performance.service.js';

/**
 * Evaluacion de desempeno (Decision #134). Modulo aparte de la formacion a proposito: ver
 * `docs/modulos/desempeno.md`.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [PerformanceController],
  providers: [PerformanceService, AuditService],
  exports: [PerformanceService],
})
export class PerformanceModule {}
