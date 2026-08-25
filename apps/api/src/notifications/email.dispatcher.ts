import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';

const MAX_RETRIES = 5;
const BATCH = 20;

/**
 * Despachador del outbox de EMAIL. Corre cada 30 s: toma PENDING de todos los tenants (via
 * cliente base + filtro explicito por tenant al marcar) y envia con Resend (API HTTP, sin SDK).
 * Sin RESEND_API_KEY (desarrollo) marca SENT y loguea — el flujo completo es probable en dev.
 * Nota RLS: el dispatcher corre SIN contexto de request; usa txForTenant por cada tenant activo.
 */
@Injectable()
export class EmailDispatcher {
  private readonly logger = new Logger(EmailDispatcher.name);
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async flush(): Promise<void> {
    if (this.running) return; // evita solapamiento si un lote tarda mas de 30 s
    this.running = true;
    try {
      const tenants = await this.prisma.tenant.findMany({ where: { active: true }, select: { id: true } });
      for (const tenant of tenants) {
        await this.flushTenant(tenant.id);
      }
    } catch (error) {
      this.logger.error('Fallo el ciclo del dispatcher de email', error as Error);
    } finally {
      this.running = false;
    }
  }

  private async flushTenant(tenantId: string): Promise<void> {
    const scoped = this.prisma.forTenant(tenantId);
    const pending = await scoped.notification.findMany({
      where: { channel: 'EMAIL', status: 'PENDING', retryCount: { lt: MAX_RETRIES } },
      orderBy: { createdAt: 'asc' },
      take: BATCH,
    });

    for (const notification of pending) {
      if (!notification.recipientEmail) {
        await scoped.notification.update({
          where: { id: notification.id },
          data: { status: 'FAILED', failedReason: 'Sin correo de destino' },
        });
        continue;
      }
      try {
        await this.send(notification.recipientEmail, notification.subject ?? '', notification.body ?? '');
        await scoped.notification.update({
          where: { id: notification.id },
          data: { status: 'SENT', sentAt: new Date(), failedReason: null },
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Error desconocido';
        await scoped.notification.update({
          where: { id: notification.id },
          data: { retryCount: { increment: 1 }, failedReason: reason },
        });
        this.logger.warn(`Email fallido (${notification.id}): ${reason}`);
      }
    }
  }

  private async send(to: string, subject: string, body: string): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      this.logger.log(`[DEV sin RESEND_API_KEY] Email simulado a ${to}: ${subject}`);
      return;
    }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL ?? 'noreply@neopulse.app',
        to,
        subject,
        text: body,
      }),
    });
    if (!response.ok) {
      throw new Error(`Resend ${response.status}: ${await response.text()}`);
    }
  }
}
