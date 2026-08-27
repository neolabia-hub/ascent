import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { tenantSettingsSchema } from '@neo-pulse/shared';
import { decideNudge, preferredHourFrom, startOfWeek } from '../engagement/nudge.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * AVISOS DE PILDORA (CLAUDE.md 3.5 y 3.12). Recuerda el microlearning pendiente a quien dejo de
 * volver, en su franja horaria y sin pasarse del tope del tenant.
 *
 * Corre CADA HORA y no una vez al dia porque el envio va en la hora en la que cada persona suele
 * estudiar: un conductor que aprende a las 7 de la noche y un auxiliar que aprende a las 6 de la
 * manana no caben en el mismo disparo.
 *
 * La regla de a quien y cuando le toca vive en `engagement/nudge.ts`, probada aparte. Aqui solo
 * se reunen los datos y se envia: asi la decision de "recordar o hostigar" se puede revisar sin
 * leer una linea de Prisma.
 *
 * Nota RLS: como el resto de workers, no hay contexto de request; se recorre cada tenant activo
 * con su propio cliente atado (`forTenant`).
 */
@Injectable()
export class PillNudgeWorker {
  private readonly logger = new Logger(PillNudgeWorker.name);
  private running = false;

  /** Un tipo de evento propio: es lo que permite contar el tope semanal sin mezclar avisos. */
  static readonly EVENT_TYPE = 'PILL_NUDGE';

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const tenants = await this.prisma.tenant.findMany({
        where: { active: true },
        select: { id: true, slug: true, settings: true },
      });
      for (const tenant of tenants) {
        try {
          const sent = await this.runTenant(tenant.id, tenant.settings);
          if (sent > 0) this.logger.log(`[${tenant.slug}] ${sent} avisos de pildora`);
        } catch (error) {
          this.logger.error(`Fallo el ciclo de avisos de ${tenant.slug}`, error as Error);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async runTenant(tenantId: string, rawSettings: unknown): Promise<number> {
    const settings = tenantSettingsSchema.parse(rawSettings ?? {});
    if (!settings.features.pills) return 0;

    const db = this.prisma.forTenant(tenantId);
    const now = new Date();
    const weekStart = startOfWeek(now);

    // Solo actividades de microlearning: la induccion pendiente tiene sus propios recordatorios
    // de vencimiento, y sumarle este aviso seria contarle dos veces el mismo ruido a la persona.
    const pills = await db.activity.findMany({
      where: { active: true, deletedAt: null, activityType: { config: { path: ['isMicro'], equals: true } } },
      select: { id: true, name: true },
    });
    if (pills.length === 0) return 0;

    const pillIds = pills.map((pill) => pill.id);
    const pending = await db.assignment.findMany({
      where: { targetType: 'ACTIVITY', targetId: { in: pillIds }, status: { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE'] } },
      select: { userId: true, targetId: true },
    });
    if (pending.length === 0) return 0;

    const byUser = new Map<string, string[]>();
    for (const row of pending) {
      byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row.targetId]);
    }
    const userIds = [...byUser.keys()];
    const pillNameById = new Map(pills.map((pill) => [pill.id, pill.name]));

    const [users, streaks, events, weekNudges] = await Promise.all([
      db.user.findMany({
        where: { id: { in: userIds }, active: true, deletedAt: null },
        select: { id: true, email: true, fullName: true, hiredAt: true },
      }),
      db.userStreak.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, lastActivityDate: true },
      }),
      // Historia reciente para deducir la franja horaria de cada persona.
      db.learningEvent.findMany({
        where: { userId: { in: userIds }, occurredAt: { gte: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000) } },
        select: { userId: true, occurredAt: true },
        take: 5000,
      }),
      db.notification.findMany({
        where: { eventType: PillNudgeWorker.EVENT_TYPE, recipientUserId: { in: userIds }, createdAt: { gte: weekStart } },
        select: { recipientUserId: true, createdAt: true },
      }),
    ]);

    const streakByUser = new Map(streaks.map((row) => [row.userId, row.lastActivityDate]));
    const hoursByUser = new Map<string, number[]>();
    for (const event of events) {
      const hour = new Date(event.occurredAt.getTime() - 5 * 60 * 60 * 1000).getUTCHours();
      hoursByUser.set(event.userId, [...(hoursByUser.get(event.userId) ?? []), hour]);
    }
    const nudgesByUser = new Map<string, Date[]>();
    for (const row of weekNudges) {
      if (!row.recipientUserId) continue;
      nudgesByUser.set(row.recipientUserId, [...(nudgesByUser.get(row.recipientUserId) ?? []), row.createdAt]);
    }

    let sent = 0;
    for (const user of users) {
      const userPills = byUser.get(user.id) ?? [];
      const history = nudgesByUser.get(user.id) ?? [];
      const decision = decideNudge({
        now,
        preferredHour: preferredHourFrom(hoursByUser.get(user.id) ?? []),
        lastActivityDate: streakByUser.get(user.id) ?? null,
        lastNudgeAt: history.length > 0 ? new Date(Math.max(...history.map((date) => date.getTime()))) : null,
        nudgesThisWeek: history.length,
        pendingPills: userPills.length,
        hiredAt: user.hiredAt,
        cadencePerWeek: settings.pillCadencePerWeek,
        weeklyCap: settings.notificationWeeklyCap,
      });
      if (!decision.send) continue;

      const first = pillNameById.get(userPills[0] ?? '') ?? 'una pildora';
      await this.notifications.notify(tenantId, {
        eventType: PillNudgeWorker.EVENT_TYPE,
        recipientUserId: user.id,
        recipientEmail: user.email,
        subject: userPills.length === 1 ? 'Tienes una pildora pendiente' : `Tienes ${userPills.length} pildoras pendientes`,
        // Se nombra la pildora y se dice cuanto cuesta: "tres minutos" es lo que hace que se abra.
        body: `${first} te espera. Son tres minutos desde el celular.`,
        referenceType: 'activities',
        referenceId: userPills[0] ?? null,
        channels: ['IN_APP', 'EMAIL'],
      });
      sent += 1;
    }
    return sent;
  }
}

