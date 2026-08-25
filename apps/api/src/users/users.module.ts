import { Module } from '@nestjs/common';
import { AuditService } from '../common/audit.service.js';
import { UserImportService } from './user-import.service.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [UsersController],
  providers: [UsersService, UserImportService, AuditService],
})
export class UsersModule {}
