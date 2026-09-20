import { Module } from '@nestjs/common';
import { CertificatesModule } from '../certificates/certificates.module.js';
import { ProgramsController } from './programs.controller.js';
import { ProgramsService } from './programs.service.js';

/**
 * Se exporta porque `CompletionService` (LearningModule) llama a `alCompletarActividad` cada vez
 * que una formacion se cierra — es el gancho que mantiene el progreso de un programa al dia sin
 * esperar a ningun cron.
 *
 * Importa `CertificatesModule` porque `recalcularProgreso` emite la constancia del programa en
 * cuanto detecta que se acaba de completar (2026-09-14) — mismo servicio que usa `CompletionService`
 * para la constancia individual, sin ciclo: `CertificatesModule` no conoce `ProgramsModule`.
 */
@Module({
  imports: [CertificatesModule],
  controllers: [ProgramsController],
  providers: [ProgramsService],
  exports: [ProgramsService],
})
export class ProgramsModule {}
