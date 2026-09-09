import { Body, Controller, Get, Header, HttpCode, Param, Patch, Post, Req, Res, StreamableFile } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser, RequirePermissions } from '../common/decorators.js';
import type { AuthUser } from '../common/types.js';
import { PerformanceService } from './performance.service.js';

/**
 * EVALUACION DE DESEMPENO (Decision #134).
 *
 * Tres públicos, y por eso tres grupos de rutas:
 *
 *   /desempeno/competencias, /formularios, /ciclos   Gestion Humana configura y abre  -> performance:manage
 *   /desempeno/mis-evaluaciones, /:id                quien califica responde          -> por IDENTIDAD
 *   /desempeno/sobre-mi                              la persona lee lo suyo y firma   -> performance:read_own
 *
 * Calificar NO tiene permiso propio a proposito: se autoriza porque esa evaluacion esta asignada a
 * ti. Un permiso global de "evaluar" dejaria a cualquiera con el rol calificando a cualquiera.
 */
@Controller('desempeno')
export class PerformanceController {
  constructor(private readonly performance: PerformanceService) {}

  // ── Configuracion ──────────────────────────────────────────────────────

  @Get('competencias')
  @RequirePermissions('performance:manage')
  listCompetencies() {
    return this.performance.listCompetencies();
  }

  @Post('competencias')
  @RequirePermissions('performance:manage')
  createCompetency(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.performance.createCompetency(body, user);
  }

  @Patch('competencias/:id')
  @RequirePermissions('performance:manage')
  updateCompetency(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.performance.updateCompetency(id, body, user);
  }

  @Get('formularios')
  @RequirePermissions('performance:manage')
  listForms() {
    return this.performance.listForms();
  }

  @Post('formularios')
  @RequirePermissions('performance:manage')
  createForm(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.performance.saveForm(null, body, user);
  }

  @Patch('formularios/:id')
  @RequirePermissions('performance:manage')
  updateForm(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.performance.saveForm(id, body, user);
  }

  // ── Ciclos ─────────────────────────────────────────────────────────────

  @Get('ciclos')
  @RequirePermissions('performance:manage')
  listCycles() {
    return this.performance.listCycles();
  }

  @Post('ciclos')
  @RequirePermissions('performance:manage')
  createCycle(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.performance.createCycle(body, user);
  }

  /**
   * ABRIR es el momento irreversible: congela el formulario y crea las evaluaciones.
   *
   * Devuelve a quien no se le pudo asignar jefe, con el motivo. Abrir en silencio dejando gente
   * fuera es como se descubre en diciembre que media empresa no fue evaluada.
   */
  @Post('ciclos/:id/abrir')
  @RequirePermissions('performance:manage')
  @HttpCode(200)
  openCycle(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.performance.openCycle(id, user);
  }

  @Post('ciclos/:id/cerrar')
  @RequirePermissions('performance:manage')
  @HttpCode(200)
  closeCycle(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.performance.closeCycle(id, user);
  }

  @Get('ciclos/:id/consolidado')
  @RequirePermissions('performance:read_all')
  cycleSummary(@Param('id') id: string) {
    return this.performance.cycleSummary(id);
  }

  /**
   * EL MISMO CONSOLIDADO, EN EXCEL. La pantalla enseña 100 filas; esto va entero.
   *
   * `StreamableFile` y no el Buffer pelado: devolver un Buffer hace que Nest lo serialice como JSON
   * y el archivo llega corrupto. El nombre del fichero lo pone el servicio —lleva ciclo y fecha—
   * porque dos descargas del mismo ciclo en semanas distintas no pueden llamarse igual.
   */
  @Get('ciclos/:id/consolidado/xlsx')
  @RequirePermissions('performance:read_all')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async cycleSummaryXlsx(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const { archivo, nombre } = await this.performance.cycleSummaryXlsx(id);
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    return new StreamableFile(archivo);
  }

  // ── Evaluar y leer lo propio ───────────────────────────────────────────

  /** Lo que me toca responder. Sin permiso: se responde porque te la asignaron. */
  @Get('mis-evaluaciones')
  myReviews(@CurrentUser() user: AuthUser) {
    return this.performance.myReviews(user);
  }

  @Get('sobre-mi')
  @RequirePermissions('performance:read_own')
  aboutMe(@CurrentUser() user: AuthUser) {
    return this.performance.aboutMe(user);
  }

  @Get(':id')
  getReview(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.performance.getReview(id, user);
  }

  @Post(':id/entregar')
  @HttpCode(200)
  submitReview(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.performance.submitReview(id, body, user);
  }

  /** Firmar es reconocer que la conversacion ocurrio, no estar de acuerdo. */
  @Post(':id/firmar')
  @HttpCode(200)
  signReview(@Param('id') id: string, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.performance.signReview(id, user, req.ip ?? null);
  }
}
