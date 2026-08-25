import { Global, Module } from '@nestjs/common';
import { AuditService } from '../common/audit.service.js';
import { ApprovalsController } from './approvals.controller.js';
import { ApprovalsService } from './approvals.service.js';

/** Global: los modulos de dominio usan requestOrExecute() y registran sus appliers. */
@Global()
@Module({
  controllers: [ApprovalsController],
  providers: [ApprovalsService, AuditService],
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
