import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CurrentUser, RequirePermissions } from '../common/decorators.js';
import type { AuthUser } from '../common/types.js';
import { RolesService } from './roles.service.js';

/** Roles y permisos del tenant (CLAUDE.md 3.4). Todas las rutas exigen `roles:manage`. */
@Controller('roles')
@RequirePermissions('roles:manage')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  list() {
    return this.roles.list();
  }

  /** Catalogo global de permisos, para armar el selector de permisos por rol. */
  @Get('permissions')
  listPermissions() {
    return this.roles.listPermissions();
  }

  @Post()
  create(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.roles.create(body, user);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.roles.update(id, body, user);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.roles.remove(id, user);
  }
}
