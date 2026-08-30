import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * LA BANDEJA SE VACIA SOLA. Un aviso no puede quedarse para siempre.
 *
 * Hasta ahora nada borraba nada: la bandeja crecia sin fin y el aviso de una obligacion retirada
 * hace tres semanas seguia ahi, delante de lo de hoy. Marcarlo leido lo quita de la vista, pero no
 * de la base — y "no se ve" no es lo mismo que "ya no esta".
 *
 * LA POLITICA, y por que estos plazos:
 *
 *   - LEIDO, mas de 30 dias  → se borra. Ya cumplio: alguien lo vio y actuo o decidio no actuar.
 *   - SIN LEER, mas de 90 dias → se borra tambien. Un recordatorio que lleva tres meses sin abrirse
 *     ya no recuerda nada; conservarlo solo infla el contador y esconde lo que si importa.
 *
 * BORRAR ESTO NO PIERDE LA TRAZA, y es lo unico que hace que sea seguro: el aviso es una COPIA de
 * un hecho que ya esta registrado en otro sitio —la obligacion en `assignments`, el acto en
 * `audit_logs`, la ejecucion en `enrollments`—. Lo que se borra es el recordatorio, no el hecho.
 * Por eso mismo no se tocan los avisos de correo pendientes de enviar: esos todavia no cumplieron.
 *
 * Corre UNA VEZ AL DIA, de madrugada: es mantenimiento, no urgencia.
 *
 * Nota RLS: como el resto de workers, no hay contexto de request, asi que se recorre cada tenant
 * activo con su propio cliente atado (`forTenant`).
 */
@Injectable()
export class NotificationRetentionWorker {
  private readonly logger = new Logger(NotificationRetentionWorker.name);
  private running = false;

  /** Dias que sobrevive un aviso ya leido. */
  static readonly LEIDO_DIAS = 30;
  /** Dias que sobrevive uno que nadie abrio. Mas largo: todavia podria estar reclamando algo. */
  static readonly SIN_LEER_DIAS = 90;

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const tenants = await this.prisma.tenant.findMany({ where: { active: true }, select: { id: true, slug: true } });
      for (const tenant of tenants) {
        try {
          const borrados = await this.runTenant(tenant.id);
          if (borrados > 0) this.logger.log(`[${tenant.slug}] ${borrados} avisos caducados`);
        } catch (error) {
          this.logger.error(`Fallo la limpieza de avisos de ${tenant.slug}`, error as Error);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async runTenant(tenantId: string): Promise<number> {
    const db = this.prisma.forTenant(tenantId);
    const ahora = Date.now();
    const leidosAntesDe = new Date(ahora - NotificationRetentionWorker.LEIDO_DIAS * 24 * 60 * 60 * 1000);
    const sinLeerAntesDe = new Date(ahora - NotificationRetentionWorker.SIN_LEER_DIAS * 24 * 60 * 60 * 1000);

    const { count } = await db.notification.deleteMany({
      where: {
        channel: 'IN_APP',
        OR: [
          { readAt: { not: null, lt: leidosAntesDe } },
          { readAt: null, createdAt: { lt: sinLeerAntesDe } },
        ],
      },
    });
    return count;
  }
}
