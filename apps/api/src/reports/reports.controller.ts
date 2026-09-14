import { Controller, Get, Header, Param, Post, Query, StreamableFile } from '@nestjs/common';
import { CurrentUser, RequirePermissions } from '../common/decorators.js';
import type { AuthUser } from '../common/types.js';
import { ReviewDigestService } from '../engagement/review-digest.service.js';
import { ExpirationDigestService } from './expiration-digest.service.js';
import { ESTADOS_EJECUCION, type EstadoEjecucion } from './execution-state.js';
import { ReportsService } from './reports.service.js';

/**
 * El filtro llega por query y puede venir de cualquiera: si no es un estado conocido se ignora.
 *
 * Ignorar y no fallar es lo correcto aqui: un parametro raro en una descarga no debe romperla, y el
 * archivo sale igualmente completo —que es mas de lo pedido, nunca menos—.
 */
function leerEstado(valor?: string): EstadoEjecucion | null {
  return valor && (ESTADOS_EJECUCION as readonly string[]).includes(valor) ? (valor as EstadoEjecucion) : null;
}

/**
 * SEGUIMIENTO DE LA EJECUCION (Decision #117).
 *
 * Responde la pregunta que los porcentajes dejaban abierta: **el 38% que falta, ¿quienes son?**
 * Sin eso, un indicador no sirve para actuar — no se sabe a quien llamar ni si el problema es que
 * la gente no entra o que nadie los convoco.
 *
 * Va bajo `reports:read_scope` y no bajo un permiso de gestion: esto es CONSULTA. Un analista que
 * solo mira indicadores tiene que poder abrirlos, y el alcance por proceso lo sigue acotando.
 */
@Controller('reportes')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly digest: ExpirationDigestService,
    private readonly reviewDigest: ReviewDigestService,
  ) {}

  /**
   * MANDAR EL AVISO DE VENCIMIENTOS AHORA (`PENDIENTES` 3.3).
   *
   * El aviso sale solo los lunes. Esto existe para dos cosas que el cron no cubre: comprobar que
   * funciona sin esperar una semana —cambiar el plazo en Preferencias y ver el efecto— y mandarlo a
   * mano el dia que el servidor estuvo caido justo el lunes.
   *
   * Va bajo `config:manage_tenant` y no bajo el permiso de LEER informes: esto no consulta nada,
   * escribe en la bandeja de todo el que pueda ver reportes. Quien mira indicadores no tiene por
   * que poder mandarle un aviso a los demas.
   *
   * Salta la comprobacion de "ya se aviso esta semana", que existe para que un reinicio del
   * servidor un lunes no mande el aviso dos veces: al pedirlo a mano se quiere justamente verlo.
   */
  @Post('vencimientos/avisar')
  @RequirePermissions('config:manage_tenant')
  avisarVencimientos(@CurrentUser() actor: AuthUser) {
    return this.digest.enviar(actor.tenantId, { forzar: true });
  }

  /**
   * MANDAR EL AVISO DE REPASO AHORA (`PENDIENTES` 5.1).
   *
   * Mismo motivo que `avisarVencimientos`: probar el texto y el umbral sin esperar al cron diario,
   * y forzarlo si el servidor se cayo justo ese dia. Mismo permiso, por el mismo argumento: no
   * consulta nada, le escribe en la bandeja a cada aprendiz con suficientes preguntas vencidas.
   */
  @Post('repaso/avisar')
  @RequirePermissions('config:manage_tenant')
  avisarRepaso(@CurrentUser() actor: AuthUser) {
    return this.reviewDigest.enviar(actor.tenantId, { forzar: true });
  }

  /** Como va TODO. Es la primera pantalla que se abre cada mañana. */
  @Get('ejecucion')
  @RequirePermissions('reports:read_scope')
  ejecucionGeneral() {
    return this.reports.ejecucionGeneral();
  }

  /** Persona por persona, como va una formacion. */
  @Get('actividades/:activityId/ejecucion')
  @RequirePermissions('reports:read_scope')
  ejecucionDeActividad(@Param('activityId') activityId: string) {
    return this.reports.ejecucionDeActividad(activityId);
  }

  /**
   * LA ANALITICA, POR TODAS LAS DIMENSIONES A LA VEZ (Decision #125).
   *
   * Quien decide no entra preguntando por una formacion: entra preguntando "¿como vamos?" y, acto
   * seguido, "¿donde esta el problema?". Por eso se devuelven los siete cortes juntos y no uno por
   * peticion: comparar "el area X va mal" con "la regional Y va mal" es el gesto entero, y partirlo
   * en siete viajes que traen los mismos hechos solo lo hace mas lento.
   *
   * `plan` acota a lo que NACIO del plan (regla de oro 2): quien ingreso en agosto no hace la
   * jornada de marzo y no puede contar como incumplimiento de ese plan.
   */
  @Get('analitica')
  @RequirePermissions('reports:read_scope')
  analitica(@Query('plan') planId?: string) {
    return this.reports.analiticaCompleta(planId ?? null);
  }

  /**
   * LO QUE SE VENCE, mirando hacia adelante (Decision #126).
   *
   * Es de donde sale el plan del año siguiente, y la segunda pregunta del auditor: la primera es
   * "¿quien lo hizo?" y la segunda "¿sigue vigente?".
   */
  @Get('vencimientos')
  @RequirePermissions('reports:read_scope')
  vencimientos(@Query('meses') meses?: string) {
    /*
      El horizonte se acota entre 1 y 24 meses. Menos de un mes no es un horizonte, y mas de dos
      años no se planea: seria traer miles de filas que nadie va a mirar para que la pantalla tarde.
    */
    const pedidos = Number(meses);
    const horizonte = Number.isFinite(pedidos) ? Math.min(24, Math.max(1, Math.trunc(pedidos))) : 12;
    return this.reports.vencimientos(horizonte);
  }

  /**
   * LA EVOLUCION DEL AÑO. Mismo permiso que la analitica: es el mismo dato, mirado en el tiempo.
   *
   * El año se acota a un rango con sentido —no hay datos antes de que existiera la plataforma, y
   * pedir el 3025 solo gasta una consulta—; fuera de rango se devuelve el año en curso.
   */
  @Get('evolucion')
  @RequirePermissions('reports:read_scope')
  evolucion(@Query('year') year?: string) {
    const enCurso = new Date().getFullYear();
    const pedido = Number(year);
    const elegido =
      Number.isFinite(pedido) && pedido >= 2020 && pedido <= enCurso + 5 ? Math.trunc(pedido) : enCurso;
    return this.reports.evolucion(elegido);
  }

  /** EN QUE FALLA LA GENTE. Mismo permiso que la analitica: es la misma pregunta, por dentro. */
  @Get('conocimiento')
  @RequirePermissions('reports:read_scope')
  conocimiento() {
    return this.reports.conocimiento();
  }

  /*
    LAS DESCARGAS VAN BAJO `reports:export` Y NO BAJO `reports:read_scope`.

    Mirar la pantalla y llevarse el archivo no son el mismo acto: lo segundo saca de la plataforma
    una lista nominal —cedulas, areas, notas— que ya vive fuera de aqui. El permiso existe desde el
    Sprint 1 justamente para esto y hasta hoy no lo usaba ningun endpoint.

    El alcance por proceso del analista sigue aplicando: las filas las arma el mismo servicio.
  */

  /** Resumen por formacion, en Excel. */
  @Get('ejecucion/xlsx')
  @RequirePermissions('reports:export')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="seguimiento.xlsx"')
  async ejecucionGeneralXlsx(@Query('estado') estado?: string): Promise<StreamableFile> {
    // StreamableFile y no el Buffer pelado: devolver un Buffer hace que Nest lo serialice como
    // JSON y el archivo llega corrupto.
    return new StreamableFile(await this.reports.ejecucionGeneralXlsx(leerEstado(estado)));
  }

  /** Persona por persona de una formacion, en Excel. Es la evidencia nominal. */
  @Get('actividades/:activityId/ejecucion/xlsx')
  @RequirePermissions('reports:export')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="seguimiento-formacion.xlsx"')
  async ejecucionDeActividadXlsx(
    @Param('activityId') activityId: string,
    @Query('estado') estado?: string,
  ): Promise<StreamableFile> {
    return new StreamableFile(await this.reports.ejecucionDeActividadXlsx(activityId, leerEstado(estado)));
  }

  /** Renglon por renglon, como va un plan. Es la entrada al detalle de arriba. */
  @Get('planes/:planId/ejecucion')
  @RequirePermissions('reports:read_scope')
  ejecucionDelPlan(@Param('planId') planId: string) {
    return this.reports.ejecucionDelPlan(planId);
  }
}
