import { Module } from '@nestjs/common';
import { AuditService } from '../common/audit.service.js';
import { RolesController } from './roles.controller.js';
import { RolesService } from './roles.service.js';

@Module({
  controllers: [RolesController],
  providers: [RolesService, AuditService],
})
export class RolesModule {}
