import { Module } from '@nestjs/common';
import { ReviewDigestService } from '../engagement/review-digest.service.js';
import { PermissionService } from '../common/permission.service.js';
import { ComplianceStreakService } from './compliance-streak.service.js';
import { ExpirationDigestService } from './expiration-digest.service.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

/**
 * Seguimiento de la ejecucion: quien la hizo, quien no, y por que (Sprint 5).
 *
 * `ReviewDigestService` y `ComplianceStreakService` no son de reportes en si — viven aqui por el
 * patron ya montado (worker por cron + servicio + a veces endpoint manual). Ver el porque en cada
 * archivo propio.
 */
@Module({
  controllers: [ReportsController],
  // `PermissionService`: el aviso semanal resuelve el alcance de cada destinatario fuera de una peticion.
  providers: [ReportsService, ExpirationDigestService, ReviewDigestService, ComplianceStreakService, PermissionService],
  exports: [ReportsService, ExpirationDigestService, ReviewDigestService, ComplianceStreakService],
})
export class ReportsModule {}
