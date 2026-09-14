import { Module } from '@nestjs/common';
import { ReviewDigestService } from '../engagement/review-digest.service.js';
import { ExpirationDigestService } from './expiration-digest.service.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

/**
 * Seguimiento de la ejecucion: quien la hizo, quien no, y por que (Sprint 5).
 *
 * `ReviewDigestService` es de repeticion espaciada, no de reportes — vive aqui por el patron ya
 * montado (worker por cron + endpoint manual), no por el dominio. Ver el porque en su propio
 * archivo.
 */
@Module({
  controllers: [ReportsController],
  providers: [ReportsService, ExpirationDigestService, ReviewDigestService],
  exports: [ReportsService, ExpirationDigestService, ReviewDigestService],
})
export class ReportsModule {}
