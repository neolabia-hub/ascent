import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { ExpirationDigestService } from '../reports/expiration-digest.service.js';

/**
 * EL AVISO SEMANAL DE LO QUE SE VENCE (`PENDIENTES` 3.3, cerrado el 2026-09-08).
 *
 * ─── POR QUE EXISTE ───
 *
 * El informe de Vencimientos estaba y **nadie recibia nada**: habia que acordarse de entrar a
 * mirarlo, que es justo el problema que el informe venia a resolver. La decision del cliente fue
 * notificacion INTERNA y no correo.
 *
 * ─── CADA CUANTO, Y POR QUE NO CADA DIA ───
 *
 * Los lunes. Lo que vence se mueve por meses y un aviso diario diria casi siempre lo mismo: en dos
 * semanas se archiva sin abrir, y con el se archiva el de las cuarenta habilitaciones de marzo.
 *
 * Este worker sabe CUANDO y para cuantos tenants; QUE se manda y a quien vive en
 * `ExpirationDigestService`, que ademas se puede disparar a mano desde la API — probar un aviso
 * semanal esperando al lunes es como no poder probarlo.
 *
 * Nota RLS: como el resto de workers no hay contexto de peticion, asi que se recorre cada tenant
 * activo y el servicio ata su propio cliente (`forTenant`).
 */
@Injectable()
export class ExpirationDigestWorker {
  private readonly logger = new Logger(ExpirationDigestWorker.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly digest: ExpirationDigestService,
  ) {}

  @Cron(CronExpression.MONDAY_TO_FRIDAY_AT_8AM)
  async run(): Promise<void> {
    // Solo los lunes. `@Cron` no trae una expresion "lunes a las 8" entre las de la libreria, y una
    // cadena cruda de cinco campos se lee peor que esta linea.
    if (new Date().getDay() !== 1) return;
    // Si la corrida anterior sigue viva no se lanza otra: dos a la vez avisarian dos veces.
    if (this.running) return;
    this.running = true;
    try {
      const tenants = await this.prisma.tenant.findMany({
        where: { active: true },
        select: { id: true, slug: true, settings: true },
      });
      for (const tenant of tenants) {
        try {
          const { enviados } = await this.digest.enviar(tenant.id);
          if (enviados > 0) this.logger.log(`[${tenant.slug}] ${enviados} avisos de vencimientos`);
        } catch (error) {
          this.logger.error(`Fallo el aviso de vencimientos de ${tenant.slug}`, error as Error);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
