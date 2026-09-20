import { Module } from '@nestjs/common';
import { CertificatesModule } from '../certificates/certificates.module.js';
import { EngagementService } from '../engagement/engagement.service.js';
import { ProgramsModule } from '../programs/programs.module.js';
import { AttemptsService } from './attempts.service.js';
import { CompletionService } from './completion.service.js';
import { LearnerService } from './learner.service.js';
import { LearningController } from './learning.controller.js';
import { PlayerService } from './player.service.js';

/**
 * El lado del aprendiz. `CompletionService` es la pieza que cierra el ciclo
 * ejecucion -> obligacion -> cobertura del plan, y por eso se exporta: la asistencia presencial
 * del Sprint 5 tambien debe poder dar por completada una formacion.
 *
 * `ProgramsModule` entra aqui por dos puertas: `CompletionService` la llama al cerrar cualquier
 * ejecucion (por si esa formacion es modulo de un programa), y `LearningController` expone "mis
 * programas" al aprendiz.
 */
@Module({
  imports: [CertificatesModule, ProgramsModule],
  controllers: [LearningController],
  providers: [LearnerService, PlayerService, AttemptsService, CompletionService, EngagementService],
  exports: [CompletionService, EngagementService],
})
export class LearningModule {}
