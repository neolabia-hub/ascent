import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentUser, RequirePermissions } from '../common/decorators.js';
import type { AuthUser } from '../common/types.js';
import { ActaDeSesionService } from './acta-de-sesion.service.js';
import { AsistenciaEnSalaService } from './asistencia-en-sala.service.js';

/**
 * LA SALA: el QR de la sesion, la firma y el acta (`PENDIENTES` 2.4).
 *
 * ─── DOS LADOS DE LA MISMA JORNADA, Y POR ESO DOS PERMISOS ───
 *
 * Lo que hace el instructor —abrir la sesion, cerrarla, generar el acta— va bajo `attendance:take`,
 * el mismo permiso que tomar la lista: son la misma potestad por otra puerta.
 *
 * Lo que hace cada asistente —mirar a que se esta apuntando, registrarse, firmar— va bajo
 * `attendance:sign`, que tiene todo el mundo. Y escribe SIEMPRE sobre la persona de la sesion: si
 * ademas dejara elegir a quien marcar seria el permiso del instructor con otro nombre.
 *
 * Las rutas del asistente cuelgan de `/asistencia` y no de `/offerings/:id/...` a proposito: quien
 * escanea no conoce el id de la jornada —conoce un codigo de seis letras— y obligar a la pantalla a
 * resolverlo antes seria pedirle que sepa algo que no sabe todavia.
 */
@Controller()
export class AsistenciaEnSalaController {
  constructor(
    private readonly sala: AsistenciaEnSalaService,
    private readonly acta: ActaDeSesionService,
  ) {}

  // ──────────────────────────── El instructor ────────────────────────────

  /**
   * Abrir o rotar el codigo que se proyecta. Devuelve el QR ya dibujado y los segundos que le
   * quedan, para que la pantalla pinte la cuenta atras sin adivinar.
   */
  @Post('offerings/:id/sesion')
  @RequirePermissions('attendance:take')
  abrir(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sala.abrirSesion(actor, id);
  }

  /**
   * CUANTOS VAN. La pide la pantalla que proyecta, cada pocos segundos: dos numeros y nada mas.
   * Devolver el roster entero para pintar "12 de 40" seria mandar cuarenta filas cada cinco segundos.
   */
  @Get('offerings/:id/sesion/marcados')
  @RequirePermissions('attendance:take')
  marcados(@Param('id', ParseUUIDPipe) id: string) {
    return this.sala.conteo(id);
  }

  /** Cerrar la sesion: el codigo deja de servir aunque no haya caducado. */
  @Post('offerings/:id/sesion/cerrar')
  @RequirePermissions('attendance:take')
  cerrar(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sala.cerrarSesion(actor, id);
  }

  /**
   * GENERAR EL ACTA de la jornada: la lista, las firmas y su huella.
   *
   * Se genera a peticion y no sola al cerrar la jornada: el acta es una foto de un momento, y la
   * lista se corrige —alguien llega tarde, alguien se apunto mal—. Generarla sola dejaria un PDF
   * que dice una cosa y una lista que dice otra, y el que manda en una auditoria es el papel.
   */
  @Post('offerings/:id/acta')
  @RequirePermissions('attendance:take')
  generarActa(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.acta.generar(actor, id);
  }

  /** Las actas generadas de una jornada, la mas reciente primero. */
  @Get('offerings/:id/actas')
  @RequirePermissions('attendance:take')
  actas(@Param('id', ParseUUIDPipe) id: string) {
    return this.acta.deLaJornada(id);
  }

  // ──────────────────────────── Quien asiste ────────────────────────────

  /**
   * A QUE ME ESTOY APUNTANDO. La pantalla lo pregunta al abrirse, antes de marcar nada: enterarse
   * de a que jornada se apunto uno por el mensaje de exito es como se firma lo que no se ha leido.
   */
  @Get('asistencia/:codigo')
  @RequirePermissions('attendance:sign')
  jornada(@Param('codigo') codigo: string) {
    return this.sala.jornadaDelCodigo(codigo);
  }

  /** MECANISMO 2: quedo presente, con mi sello de tiempo. */
  @Post('asistencia/:codigo/registrarme')
  @RequirePermissions('attendance:sign')
  registrarme(@CurrentUser() actor: AuthUser, @Param('codigo') codigo: string) {
    return this.sala.registrarme(actor, codigo);
  }

  /** MECANISMO 3: ademas firmo, y la firma queda atada a mi asistencia de esta jornada. */
  @Post('asistencia/firmar')
  @RequirePermissions('attendance:sign')
  firmar(@CurrentUser() actor: AuthUser, @Body() body: unknown) {
    return this.sala.firmar(actor, body);
  }

  /** Si ya estoy marcado en esta jornada, para no ofrecer dos veces lo mismo. */
  @Get('asistencia/:codigo/lo-mio')
  @RequirePermissions('attendance:sign')
  loMio(@CurrentUser() actor: AuthUser, @Param('codigo') codigo: string, @Query('_') _ignorado?: string) {
    return this.sala.loMio(actor, codigo);
  }
}
