import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { tenantSettingsSchema } from '@neo-pulse/shared';
import { cuandoCierra, diasHastaElCierre, tocaRecordar } from '../performance/performance-reminder.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * RECORDATORIO DEL CICLO DE DESEMPENO (Decision #134, pendiente cerrado el 2026-09-02).
 *
 * Al abrir un ciclo se avisa a cada evaluador una vez. Entre eso y el cierre no habia nada, y una
 * campana de seis semanas se olvida en la primera: el dia del cierre aparecian cuarenta
 * evaluaciones sin responder y ya no habia tiempo. Esto avisa a QUIEN AUN NO HA RESPONDIDO cuando
 * quedan pocos dias.
 *
 * ─── SOLO A QUIEN LE FALTA, Y UNA VEZ POR CICLO ───
 *
 * Quien ya entrego todo lo suyo no recibe nada: un recordatorio de algo que ya hiciste es la forma
 * mas rapida de que dejen de leerse los avisos. Y no se repite dia tras dia — antes de enviar se
 * mira si esa persona ya tiene el aviso de ESTE ciclo.
 *
 * ─── UNA VEZ AL DIA, POR LA MANANA ───
 *
 * No cada hora como el de pildoras: aquello se envia en la franja en la que cada quien estudia;
 * esto es trabajo de oficina y llega al empezar el dia.
 *
 * Nota RLS: como el resto de workers no hay contexto de peticion, asi que se recorre cada tenant
 * activo con su propio cliente atado (`forTenant`).
 */
@Injectable()
export class PerformanceReminderWorker {
  private readonly logger = new Logger(PerformanceReminderWorker.name);
  private running = false;

  /** Tipo propio: es lo que permite saber si a esta persona ya se le aviso de este ciclo. */
  static readonly EVENT_TYPE = 'PERFORMANCE_CYCLE_REMINDER';

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async run(): Promise<void> {
    // Si la corrida anterior sigue viva no se lanza otra: dos a la vez enviarian el aviso dos veces.
    if (this.running) return;
    this.running = true;
    try {
      const tenants = await this.prisma.tenant.findMany({
        where: { active: true },
        select: { id: true, slug: true, settings: true },
      });
      for (const tenant of tenants) {
        try {
          const enviados = await this.runTenant(tenant.id, tenant.settings);
          if (enviados > 0) this.logger.log(`[${tenant.slug}] ${enviados} recordatorios de desempeno`);
        } catch (error) {
          this.logger.error(`Fallo el recordatorio de desempeno de ${tenant.slug}`, error as Error);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async runTenant(tenantId: string, rawSettings: unknown): Promise<number> {
    // CUANTOS DIAS ANTES lo decide el tenant, no el codigo: una campana de seis semanas y una de
    // dos no se recuerdan con el mismo plazo. 0 lo apaga.
    const { performanceReminderDays } = tenantSettingsSchema.parse(rawSettings ?? {});
    if (performanceReminderDays === 0) return 0;

    const db = this.prisma.forTenant(tenantId);
    const ahora = new Date();

    const ciclos = await db.performanceCycle.findMany({
      where: { status: 'OPEN' },
      select: { id: true, name: true, endsAt: true },
    });

    let enviados = 0;
    for (const ciclo of ciclos) {
      if (!tocaRecordar(ciclo.endsAt, ahora, performanceReminderDays)) continue;

      // Quien tiene algo SIN entregar en este ciclo.
      const pendientes = await db.performanceReview.findMany({
        where: { cycleId: ciclo.id, status: { not: 'SUBMITTED' } },
        select: { evaluatorUserId: true },
      });
      if (pendientes.length === 0) continue;

      const cuantas = new Map<string, number>();
      for (const fila of pendientes) {
        cuantas.set(fila.evaluatorUserId, (cuantas.get(fila.evaluatorUserId) ?? 0) + 1);
      }

      // A quien ya se le aviso de este ciclo no se le vuelve a avisar.
      const yaAvisados = await db.notification.findMany({
        where: {
          eventType: PerformanceReminderWorker.EVENT_TYPE,
          referenceId: ciclo.id,
          recipientUserId: { in: [...cuantas.keys()] },
        },
        select: { recipientUserId: true },
      });
      for (const aviso of yaAvisados) {
        if (aviso.recipientUserId) cuantas.delete(aviso.recipientUserId);
      }
      if (cuantas.size === 0) continue;

      const gente = await db.user.findMany({
        where: { id: { in: [...cuantas.keys()] }, active: true, deletedAt: null },
        select: { id: true, email: true },
      });

      const faltan = diasHastaElCierre(ciclo.endsAt, ahora);
      await this.notifications.notifyMany(
        tenantId,
        gente.map((quien) => {
          const total = cuantas.get(quien.id) ?? 0;
          return {
            eventType: PerformanceReminderWorker.EVENT_TYPE,
            recipientUserId: quien.id,
            recipientEmail: quien.email,
            subject: `${ciclo.name} ${cuandoCierra(faltan)}: te faltan ${total} evaluacion${total === 1 ? '' : 'es'}`,
            body: 'Las tienes en Desempeno, dentro de tu menu. Una vez entregadas no se pueden corregir.',
            referenceType: 'performance_cycles',
            referenceId: ciclo.id,
          };
        }),
      );
      enviados += gente.length;
    }

    return enviados;
  }
}
