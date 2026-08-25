import { Module } from '@nestjs/common';
import { AuditService } from '../common/audit.service.js';
import { CatalogsController } from './catalogs.controller.js';
import { CatalogsService } from './catalogs.service.js';

@Module({
  controllers: [CatalogsController],
  providers: [CatalogsService, AuditService],
})
export class CatalogsModule {}
