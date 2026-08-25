import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { createApprovalSchema, decideApprovalSchema, listApprovalsQuerySchema } from '@neo-pulse/shared';
import { CurrentUser, RequirePermissions } from '../common/decorators.js';
import type { AuthUser } from '../common/types.js';
import { ApprovalsService } from './approvals.service.js';

@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  /** Cualquier usuario autenticado puede CREAR una solicitud (el gate real vive en cada flujo). */
  @Post()
  create(@CurrentUser() actor: AuthUser, @Body() body: unknown) {
    return this.approvals.create(actor, createApprovalSchema.parse(body));
  }

  @Get()
  @RequirePermissions('approvals:decide')
  list(@Query() query: Record<string, string>) {
    const q = listApprovalsQuerySchema.parse(query);
    return this.approvals.list(q.status, q.page, q.pageSize);
  }

  @Get('mine')
  mine(@CurrentUser() actor: AuthUser, @Query() query: Record<string, string>) {
    const q = listApprovalsQuerySchema.parse(query);
    return this.approvals.mine(actor, q.page, q.pageSize);
  }

  @Post(':id/decide')
  @RequirePermissions('approvals:decide')
  decide(@CurrentUser() approver: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.approvals.decide(approver, id, decideApprovalSchema.parse(body));
  }
}
