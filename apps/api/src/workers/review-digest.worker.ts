import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReviewDigestService } from '../engagement/review-digest.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * EL AVISO DIARIO DE REPASO (`PENDIENTES` 5.1).
 *
 * ─── CADA CUANTO, Y POR QUE TODOS LOS DIAS (a diferencia de Vencimientos) ───
 *
 * Vencimientos corre los lunes porque lo que vence se mueve por meses. El repaso es lo contrario:
 * las preguntas vencen a 1, 2, 7, 14 o 30 dias (`spaced-repetition.ts`), asi que lo que hay pendiente
 * cambia dia a dia. Un aviso semanal llegaria diciendo "tienes 12 vencidas" cuando en realidad son
 * de cinco dias distintos amontonadas.
 *
 * ─── POR QUE NO ES PARTE DEL NUDGE DE PILDORAS ───
 *
 * `PillNudgeWorker` ya tiene una logica fina —franja horaria historica, tope semanal— para no
 * empujar de mas. Este aviso NO la reutiliza a proposito: son cosas distintas (una empuja a EMPEZAR
 * algo nuevo, esta avisa de algo YA vencido) y mezclarlas ahora acoplaria dos reglas de negocio que
 * pueden cambiar por separado. El propio umbral del tenant (`reviewDigestMinDue`, en 0 lo apaga) es
 * el freno de esta primera version — si con el piloto hace falta mas finura, se junta con el nudge
 * entonces, con datos de uso reales delante.
 */
@Injectable()
export class ReviewDigestWorker {
  private readonly logger = new Logger(ReviewDigestWorker.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly digest: ReviewDigestService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const tenants = await this.prisma.tenant.findMany({ where: { active: true }, select: { id: true, slug: true } });
      for (const tenant of tenants) {
        try {
          const { enviados } = await this.digest.enviar(tenant.id);
          if (enviados > 0) this.logger.log(`[${tenant.slug}] ${enviados} avisos de repaso`);
        } catch (error) {
          this.logger.error(`Fallo el aviso de repaso de ${tenant.slug}`, error as Error);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
