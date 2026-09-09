import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentUser, RequirePermissions } from '../common/decorators.js';
import type { AuthUser } from '../common/types.js';
import { ConvalidacionService } from './convalidacion.service.js';

/**
 * CONVALIDAR: DAR POR CUMPLIDA UNA OBLIGACION CON EL PAPEL DE OTRO EMPLEO (via C, 2.3).
 *
 * ─── POR QUE BAJO `assignments:manage` Y NO BAJO `attendance:take` ───
 *
 * Registrar un certificado tras una jornada (2.1 y 2.2) es completar la evidencia de algo que
 * ocurrio AQUI: lo hace quien toma listas. Convalidar es otra cosa — es **aceptar la evidencia de
 * otra empresa en lugar de la propia**, y con eso se cierra una obligacion sin que nadie de esta
 * casa haya visto a la persona formarse.
 *
 * Esa decision pertenece a quien administra obligaciones, no a quien pasa lista en un salon. Darle
 * `attendance:take` esa potestad significaria que cualquiera que toma asistencia puede dar por
 * cumplido lo que quiera con un PDF.
 */
@Controller('assignments')
export class ConvalidacionController {
  constructor(private readonly convalidacion: ConvalidacionService) {}

  /** Las obligaciones abiertas de alguien cuya formacion admite convalidacion. */
  @Get('convalidables')
  @RequirePermissions('assignments:manage')
  convalidables(@Query('userId', ParseUUIDPipe) userId: string) {
    return this.convalidacion.convalidablesDe(userId);
  }

  /** Aceptar el papel y darla por cumplida. Exige motivo. */
  @Post(':id/convalidar')
  @RequirePermissions('assignments:manage')
  convalidar(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.convalidacion.convalidar(actor, id, body);
  }
}
