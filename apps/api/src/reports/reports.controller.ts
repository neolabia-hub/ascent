import { Controller, Get, Param } from '@nestjs/common';
import { RequirePermissions } from '../common/decorators.js';
import { ReportsService } from './reports.service.js';

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
  constructor(private readonly reports: ReportsService) {}

  /** Como va TODO. Es la primera pantalla que se abre cada manana. */
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

  /** Renglon por renglon, como va un plan. Es la entrada al detalle de arriba. */
  @Get('planes/:planId/ejecucion')
  @RequirePermissions('reports:read_scope')
  ejecucionDelPlan(@Param('planId') planId: string) {
    return this.reports.ejecucionDelPlan(planId);
  }
}
