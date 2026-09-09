import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { CurrentUser, RequirePermissions } from '../common/decorators.js';
import type { AuthUser } from '../common/types.js';
import { PapelDeTerceroService } from './papel-de-tercero.service.js';

/**
 * LA SEGUNDA PUERTA AL PAPEL DE UN TERCERO (`PENDIENTES` 2.2).
 *
 * ─── EL PROBLEMA QUE CIERRA ───
 *
 * El certificado de la ARL llega quince dias despues de la jornada. Hasta hoy la unica forma de
 * registrarlo era **volver a la convocatoria**: acordarse de cual de las cuarenta era, buscarla,
 * abrir la lista y encontrar a la persona dentro.
 *
 * Pero la peticion nunca llega asi. Llega con un nombre delante —*"acaba de llegar el certificado
 * de alturas de Juan"*— igual que las constancias internas (Decision #128, que resolvio lo mismo
 * para el otro papel). Buscar a Juan es el primer gesto; obligar a reconstruir a que jornada fue es
 * pedirle al usuario que haga de indice.
 *
 * ─── POR QUE UNA PUERTA PROPIA Y NO REUSAR LA DE ASISTENCIA ───
 *
 * `POST /offerings/:id/attendance` sirve para TOMAR LA LISTA: manda un estado por persona y cierra
 * formaciones. Desde la ficha de alguien no se esta tomando ninguna lista —la jornada ya paso, la
 * persona ya consta— y usarla obligaria a mandar `estado: PRESENT` sobre una asistencia que ya esta
 * marcada, solo para que el certificado llegara de rebote. Un dia alguien lo mandaria con otro
 * estado y **remarcaria una asistencia sin querer**.
 *
 * Aqui la operacion es exactamente la que se quiere: corregir el papel de UNA inscripcion, sin
 * tocar su estado, su fecha de cumplimiento ni su acta.
 *
 * Va bajo `attendance:take` por lo mismo que la lista: quien registra evidencia de formacion
 * presencial tiene ese permiso, y no tiene por que poder publicar convocatorias.
 */
@Controller('enrollments')
export class PapelDeTerceroController {
  constructor(private readonly papel: PapelDeTerceroService) {}

  /**
   * LAS FORMACIONES DE ALGUIEN QUE LLEVAN PAPEL DE UN TERCERO.
   *
   * Solo las que lo llevan: ofrecer las demas seria ofrecer un campo que el servidor va a rechazar.
   * Y solo las CERRADAS, porque el papel acredita algo que ya paso — a quien todavia la debe no se
   * le registra un certificado, se le convoca.
   */
  @Get('con-papel-de-tercero')
  @RequirePermissions('attendance:take')
  conPapel(@Query('userId', ParseUUIDPipe) userId: string) {
    return this.papel.deLaPersona(userId);
  }

  /** Registrar o corregir el papel de una inscripcion concreta. */
  @Patch(':id/papel-de-tercero')
  @RequirePermissions('attendance:take')
  guardar(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.papel.guardar(actor, id, body);
  }
}
