import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ComplianceStreakService } from '../reports/compliance-streak.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * RECALCULA LA RACHA DE CUMPLIMIENTO DE CADA TENANT, UNA VEZ AL DIA (`PENDIENTES` 8.3).
 *
 * Temprano y ANTES de que la gente empiece a mirar Inicio, para que el titular ya este listo desde
 * la primera carga del dia y no cambie a media mañana. Por lo mismo que `ExpirationDigestWorker` y
 * `ReviewDigestWorker`: barato (un tenant activo tarda milisegundos) y sin efecto secundario si se
 * ejecuta dos veces el mismo dia — `avanzarRachaCumplimiento` es idempotente para el mismo dia.
 */
@Injectable()
export class ComplianceStreakWorker {
  private readonly logger = new Logger(ComplianceStreakWorker.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly streak: ComplianceStreakService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const tenants = await this.prisma.tenant.findMany({ where: { active: true }, select: { id: true, slug: true } });
      for (const tenant of tenants) {
        try {
          const { currentDays, outcome } = await this.streak.actualizar(tenant.id);
          if (outcome === 'HAD_OVERDUE') this.logger.log(`[${tenant.slug}] racha reiniciada (hay vencidos)`);
          else if (outcome === 'CONTINUED' || outcome === 'FIRST_ZERO') this.logger.log(`[${tenant.slug}] racha en ${currentDays} dias`);
        } catch (error) {
          this.logger.error(`Fallo la racha de cumplimiento de ${tenant.slug}`, error as Error);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
