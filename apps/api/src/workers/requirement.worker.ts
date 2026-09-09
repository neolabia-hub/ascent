import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequirementEngineService } from '../assignments/requirement-engine.service.js';

/**
 * Vigilante de las obligaciones (CLAUDE.md 5, colas: RequirementWorker + AudienceWorker).
 *
 * El motor ya corre en caliente cuando alguien entra o cambia de cargo; este ciclo cubre lo que
 * pasa SOLO por el paso del tiempo y nadie dispara: la reinduccion que cumple su año, el carne
 * que vence, la obligacion que se pasa de fecha.
 *
 * Corre cada hora, no cada minuto: las fechas de vencimiento son DIAS, y un ciclo barato que
 * nadie nota vale mas que uno agresivo que compite con la operacion.
 *
 * Nota RLS: el worker no tiene contexto de request; recorre los tenants activos y trabaja cada
 * uno con su propio cliente atado (`forTenant`).
 */
@Injectable()
export class RequirementWorker {
  private readonly logger = new Logger(RequirementWorker.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: RequirementEngineService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async run(): Promise<void> {
    if (this.running) return; // un tenant grande puede tardar; nunca se solapa consigo mismo
    this.running = true;
    try {
      const tenants = await this.prisma.tenant.findMany({ where: { active: true }, select: { id: true, slug: true } });
      for (const tenant of tenants) {
        try {
          const summary = await this.engine.syncTenant(tenant.id);
          const changed =
            summary.created + summary.cyclesOpened + summary.overdue + summary.withdrawn + summary.audiencesJoined + summary.audiencesLeft;
          if (changed > 0) {
            this.logger.log(
              `[${tenant.slug}] audiencias +${summary.audiencesJoined}/-${summary.audiencesLeft}, ` +
                `obligaciones nuevas ${summary.created} (rondas ${summary.cyclesOpened}), ` +
                `vencidas ${summary.overdue}, retiradas ${summary.withdrawn}`,
            );
          }
        } catch (error) {
          this.logger.error(`Fallo el ciclo de requisitos de ${tenant.slug}`, error as Error);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
