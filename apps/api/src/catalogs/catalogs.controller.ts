import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CurrentUser, RequirePermissions } from '../common/decorators.js';
import type { AuthUser } from '../common/types.js';
import { CatalogsService } from './catalogs.service.js';

/**
 * Catalogos parametrizables del tenant (CLAUDE.md 3.2): areas, procesos, tipos de cargo, cargos,
 * servicios, regionales, normas y tipos de actividad. Ruta dinamica `:catalog` porque los ocho
 * comparten exactamente la misma forma de endpoint (list/create/update/remove); la validacion del
 * segmento vive en el service (`assertCatalogKey`).
 *
 * Lectura: cualquier usuario autenticado (los formularios de otras pantallas necesitan poblar
 * selects de catalogo). Escritura: exige `config:manage_catalogs`.
 */
@Controller('catalogs')
export class CatalogsController {
  constructor(private readonly catalogs: CatalogsService) {}

  @Get(':catalog')
  list(@Param('catalog') catalog: string) {
    return this.catalogs.list(catalog);
  }

  @Post(':catalog')
  @RequirePermissions('config:manage_catalogs')
  create(@Param('catalog') catalog: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.catalogs.create(catalog, body, user);
  }

  @Patch(':catalog/:id')
  @RequirePermissions('config:manage_catalogs')
  update(
    @Param('catalog') catalog: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    return this.catalogs.update(catalog, id, body, user);
  }

  @Delete(':catalog/:id')
  @RequirePermissions('config:manage_catalogs')
  remove(
    @Param('catalog') catalog: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.catalogs.remove(catalog, id, user);
  }
}
