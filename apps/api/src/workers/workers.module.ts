import { Module } from '@nestjs/common';
import { RequirementWorker } from './requirement.worker.js';

/** Trabajos programados del sistema. El motor de requisitos llega por AssignmentsModule (global). */
@Module({
  providers: [RequirementWorker],
})
export class WorkersModule {}
