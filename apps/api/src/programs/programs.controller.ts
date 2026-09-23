import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { assignProgramSchema } from '@neo-pulse/shared';
import { CurrentUser, RequirePermissions } from '../common/decorators.js';
import type { AuthUser } from '../common/types.js';
import { ProgramsService } from './programs.service.js';

/**
 * BANCO DE PROGRAMAS (2026-09-14). Vive junto al resto del catalogo formativo en la interfaz —
 * "Contenido formativo -> Programas"—. Un programa en borrador no es un compromiso con nadie
 * todavia, igual que una formacion sin publicar.
 *
 * ─── PERMISOS PROPIOS DESDE EL 2026-09-22 ───
 *
 * Usaba los del catalogo, asi que **quien podia crear una formacion veia y tocaba los programas**,
 * y no habia forma de quitarselos sin quitarle el catalogo entero. El cliente lo pidio expreso:
 * *"programa no pueden, solo seguimiento, inicio, convocatorias"*.
 *
 * Ahora son `programs:read`, `programs:manage` y `programs:publish`. El reparto es el mismo del
 * catalogo y por el mismo motivo: ver, armar y sacar a la gente son decisiones distintas —
 * publicar un programa **apaga la constancia individual de todos sus modulos**, que no es
 * «guardar».
 */
@Controller('programas')
export class ProgramsController {
  constructor(private readonly programs: ProgramsService) {}

  @Get()
  @RequirePermissions('programs:read')
  listar() {
    return this.programs.listar();
  }

  /**
   * De que programas es modulo una formacion. Va ANTES de `:id` a proposito: si estuviera despues,
   * "de-formacion" se leeria como un id de programa y esta ruta no se alcanzaria nunca.
   */
  @Get('de-formacion/:activityId')
  @RequirePermissions('programs:read')
  programasDeFormacion(@Param('activityId') activityId: string) {
    return this.programs.programasDeFormacion(activityId);
  }

  @Get(':id')
  @RequirePermissions('programs:read')
  obtener(@Param('id') id: string) {
    return this.programs.obtener(id);
  }

  @Post()
  @RequirePermissions('programs:manage')
  crear(@CurrentUser() actor: AuthUser, @Body() body: { code: string; name: string; description?: string | null }) {
    return this.programs.crear(actor.tenantId, body);
  }

  @Patch(':id')
  @RequirePermissions('programs:manage')
  actualizar(@Param('id') id: string, @Body() body: { name?: string; description?: string | null; active?: boolean }) {
    return this.programs.actualizar(id, body);
  }

  /**
   * A QUIEN LE CUESTA PUBLICAR ESTE PROGRAMA. Se pide justo antes de publicar, no en cada carga de
   * la ficha: recorre las obligaciones de todos los modulos. Ver `ProgramsService.impactoDePublicar`.
   */
  @Get(':id/impacto-de-publicar')
  @RequirePermissions('programs:publish')
  impactoDePublicar(@Param('id') id: string) {
    return this.programs.impactoDePublicar(id);
  }

  @Post(':id/publicar')
  @RequirePermissions('programs:publish')
  publicar(@Param('id') id: string) {
    return this.programs.publicar(id);
  }

  @Post(':id/despublicar')
  @RequirePermissions('programs:publish')
  despublicar(@Param('id') id: string) {
    return this.programs.despublicar(id);
  }

  /**
   * Exigir el programa entero a una audiencia, en un solo boton — mismo permiso que exigir una
   * formacion suelta desde su ficha (`assignments:manage`, y no `programs:*`: esto no arma el
   * programa, crea obligaciones para gente de verdad).
   */
  @Post(':id/asignar')
  @RequirePermissions('assignments:manage')
  asignarAudiencia(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.programs.asignarAudiencia(actor, id, assignProgramSchema.parse(body));
  }

  @Post(':id/modulos')
  @RequirePermissions('programs:manage')
  agregarModulo(
    @Param('id') id: string,
    @Body() body: { activityId: string; isRequired: boolean; sectionName?: string; minRequiredInSection?: number },
  ) {
    return this.programs.agregarModulo(id, body);
  }

  @Patch(':id/modulos/:itemId')
  @RequirePermissions('programs:manage')
  actualizarModulo(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: { isRequired?: boolean; sectionName?: string | null; maxFallosEnSeccion?: number | null },
  ) {
    return this.programs.actualizarModulo(id, itemId, body);
  }

  @Delete(':id/modulos/:itemId')
  @RequirePermissions('programs:manage')
  quitarModulo(@Param('id') id: string, @Param('itemId') itemId: string) {
    return this.programs.quitarModulo(id, itemId);
  }

  /**
   * El cupo de un grupo: "de estos N hacen falta M". Es una regla del PROGRAMA, no de un modulo, y
   * por eso se configura desde el programa con el grupo ya armado — ver `fijarMinimoDeGrupo`.
   */
  @Post(':id/grupos/minimo')
  @RequirePermissions('programs:manage')
  fijarMinimoDeGrupo(@Param('id') id: string, @Body() body: { sectionName: string; minRequiredInSection: number }) {
    return this.programs.fijarMinimoDeGrupo(id, body.sectionName, Number(body.minRequiredInSection));
  }

  /** Reordenar: sube o baja un modulo en la lista. Se manda el orden completo, no un delta. */
  @Post(':id/modulos/reordenar')
  @RequirePermissions('programs:manage')
  reordenarModulos(@Param('id') id: string, @Body() body: { itemIds: string[] }) {
    return this.programs.reordenarModulos(id, body.itemIds);
  }
}
