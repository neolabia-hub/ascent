import { Global, Module } from '@nestjs/common';
import { AuditService } from '../common/audit.service.js';
import { AssignmentsController } from './assignments.controller.js';
import { AssignmentsService } from './assignments.service.js';
import { AudiencesService } from './audiences.service.js';
import { RequirementEngineService } from './requirement-engine.service.js';

/**
 * Global: el alta de personas, la carga masiva, el plan anual y los crons necesitan el motor de
 * requisitos. Exponerlo evita cadenas de imports circulares entre personas y obligaciones.
 */
@Global()
@Module({
  controllers: [AssignmentsController],
  providers: [AssignmentsService, AudiencesService, RequirementEngineService, AuditService],
  exports: [AssignmentsService, AudiencesService, RequirementEngineService],
})
export class AssignmentsModule {}
