import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export interface NotifyInput {
  eventType: string;
  recipientUserId?: string | null;
  recipientEmail?: string | null;
  subject: string;
  body: string;
  referenceType?: string | null;
  referenceId?: string | null;
  channels?: Array<'IN_APP' | 'EMAIL'>;
}

/**
 * Outbox de notificaciones: la fila PENDING se escribe (idealmente en la MISMA transaccion del
 * cambio de dominio via `notifyTx`) y el dispatcher la drena. IN_APP queda SENT de inmediato
 * (la bandeja la lee de la tabla); EMAIL lo envia el dispatcher (Resend).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Version transaccional: usar dentro de prisma.tx(...) junto al cambio de dominio. */
  async notifyTx(tx: Prisma.TransactionClient, tenantId: string, input: NotifyInput): Promise<void> {
    for (const data of this.buildRows(tenantId, input)) {
      await tx.notification.create({ data });
    }
  }

  /** Version simple (fuera de transaccion). Nunca tumba el flujo si falla. */
  async notify(tenantId: string, input: NotifyInput): Promise<void> {
    try {
      for (const data of this.buildRows(tenantId, input)) {
        await this.prisma.forTenant(tenantId).notification.create({ data });
      }
    } catch (error) {
      this.logger.error(`No se pudo encolar notificacion ${input.eventType}`, error as Error);
    }
  }


  /**
   * MUCHOS AVISOS DE UNA VEZ.
   *
   * `notify()` uno por uno cuesta, por cada persona, una llamada a `forTenant` —que abre su propia
   * transaccion con el `set_config` de RLS— y un INSERT por canal. Con 459 personas eso son ~900
   * transacciones y la peticion tardaba **mas de 40 segundos**: al exigir una induccion a toda la
   * empresa, la pantalla parecia colgada y habia que salir y volver para ver el resultado.
   *
   * Aqui es UNA transaccion y un `createMany`. La bandeja del aprendiz lee de la misma tabla, asi
   * que no cambia nada de lo que ve.
   */
  async notifyMany(tenantId: string, inputs: NotifyInput[]): Promise<void> {
    if (inputs.length === 0) return;
    try {
      const data = inputs.flatMap((input) => this.buildRows(tenantId, input));
      await this.prisma.forTenant(tenantId).notification.createMany({ data });
    } catch (error) {
      this.logger.error(`No se pudieron encolar ${inputs.length} notificaciones`, error as Error);
    }
  }

  /** Notifica a TODOS los usuarios del tenant con un permiso dado (p. ej. admins que deciden). */
  async notifyByPermission(tenantId: string, permissionCode: string, input: Omit<NotifyInput, 'recipientUserId'>): Promise<void> {
    const users = await this.prisma.forTenant(tenantId).user.findMany({
      where: {
        active: true,
        deletedAt: null,
        role: { permissions: { some: { permission: { code: permissionCode } } } },
      },
      select: { id: true, email: true },
    });
    for (const user of users) {
      await this.notify(tenantId, { ...input, recipientUserId: user.id, recipientEmail: user.email });
    }
  }

  /** Bandeja in-app del usuario actual. */
  async inbox(userId: string, unreadOnly: boolean) {
    const where = {
      recipientUserId: userId,
      channel: 'IN_APP' as const,
      ...(unreadOnly ? { readAt: null } : {}),
    };
    const [unread, items] = await Promise.all([
      this.prisma.scoped.notification.count({ where: { recipientUserId: userId, channel: 'IN_APP', readAt: null } }),
      this.prisma.scoped.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          eventType: true,
          subject: true,
          body: true,
          referenceType: true,
          referenceId: true,
          readAt: true,
          createdAt: true,
        },
      }),
    ]);
    return { unread, items };
  }

  async markRead(userId: string, id: string): Promise<{ ok: true }> {
    await this.prisma.scoped.notification.updateMany({
      where: { id, recipientUserId: userId },
      data: { readAt: new Date(), status: 'READ' },
    });
    return { ok: true };
  }

  async markAllRead(userId: string): Promise<{ ok: true }> {
    await this.prisma.scoped.notification.updateMany({
      where: { recipientUserId: userId, channel: 'IN_APP', readAt: null },
      data: { readAt: new Date(), status: 'READ' },
    });
    return { ok: true };
  }

  private buildRows(tenantId: string, input: NotifyInput): Prisma.NotificationUncheckedCreateInput[] {
    const channels = input.channels ?? ['IN_APP', 'EMAIL'];
    return channels
      .filter((c) => c !== 'EMAIL' || Boolean(input.recipientEmail))
      .map((channel) => ({
        tenantId,
        eventType: input.eventType,
        channel,
        recipientUserId: input.recipientUserId ?? null,
        recipientEmail: input.recipientEmail ?? null,
        // IN_APP no necesita despacho: la bandeja lee de la tabla.
        status: channel === 'IN_APP' ? 'SENT' : 'PENDING',
        sentAt: channel === 'IN_APP' ? new Date() : null,
        subject: input.subject,
        body: input.body,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
      }));
  }
}
