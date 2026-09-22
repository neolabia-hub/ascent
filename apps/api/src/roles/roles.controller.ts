import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { alcancePorTipoSchema } from '@neo-pulse/shared';
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

  /*
    ─── QUE TIPOS DE FORMACION PUEDE TOCAR ESTE ROL (2026-09-22) ───

    Va `PUT` con el conjunto entero, y no altas y bajas sueltas: la pantalla marca casillas y
    guarda. Con operaciones por tipo, dos pestañas abiertas se pisan y el resultado depende del
    orden en que llegaron los clics.

    **Lista vacia = sin acotar**, que es como nace todo. Acotar es un acto deliberado: es el mismo
    convenio que el alcance por proceso, y el que evita que guardar sin marcar nada deje a un rol
    entero sin poder crear una sola formacion.
  */
  @Get(':id/tipos')
  tiposDelRol(@Param('id', ParseUUIDPipe) id: string) {
    return this.roles.tiposDelRol(id);
  }

  @Put(':id/tipos')
  fijarTiposDelRol(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    const { activityTypeIds } = alcancePorTipoSchema.parse(body);
    return this.roles.fijarTiposDelRol(id, activityTypeIds, user);
  }
}
