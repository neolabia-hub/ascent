import { Injectable } from '@nestjs/common';
import { tenantSettingsSchema } from '@neo-pulse/shared';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { redactarAviso, resumirParaElAviso } from './expiration-digest.js';
import { ReportsService } from './reports.service.js';

/**
 * QUIEN MANDA EL AVISO DE VENCIMIENTOS, Y A QUIEN (`PENDIENTES` 3.3).
 *
 * ─── POR QUE ES UN SERVICIO Y NO EL WORKER ENTERO ───
 *
 * El worker sabe CUANDO (los lunes) y para CUANTOS tenants; esto sabe QUE se manda y a quien. Estan
 * separados porque la segunda mitad hace falta tambien a mano: para probar el aviso sin esperar al
 * lunes, y el dia que el servidor estuvo caido justo el lunes. Con todo dentro del cron, la unica
 * forma de comprobarlo era cambiar la hora del sistema.
 *
 * ─── A QUIEN ───
 *
 * A quien puede hacer algo con ello: los que tienen `reports:read_scope`, que son los mismos que
 * pueden abrir la pantalla. No se nombra ningun rol —la regla de oro es que los guards evaluan
 * permisos y nunca nombres de rol— y asi un tenant que cree un rol propio de SST lo recibe sin que
 * nadie toque el codigo.
 *
 * ─── Y SOLO POR LA BANDEJA ───
 *
 * Decision del cliente: notificacion interna, no correo. Por eso `channels: ['IN_APP']` explicito y
 * no el defecto, que manda los dos.
 */
@Injectable()
export class ExpirationDigestService {
  /** Tipo propio: es lo que permite saber si a esta persona ya se le aviso esta semana. */
  static readonly EVENT_TYPE = 'EXPIRATIONS_DIGEST';

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly reports: ReportsService,
  ) {}

  /**
   * Manda el aviso de un tenant. Devuelve a cuantos se les mando.
   *
   * `forzar` salta la comprobacion de "ya se le aviso esta semana", que existe para que un reinicio
   * del servidor un lunes por la mañana no mande el aviso dos veces. Al pedirlo a mano se quiere
   * justamente eso: verlo ahora.
   */
  async enviar(
    tenantId: string,
    opciones: { hoy?: Date; forzar?: boolean } = {},
  ): Promise<{ enviados: number; motivo?: string }> {
    const hoy = opciones.hoy ?? new Date();

    // CUANTOS DIAS MIRA HACIA ADELANTE lo decide el tenant. 0 lo apaga: hay empresas que prefieren
    // llevarlo por su cuenta, y un aviso que no se quiere es el que enseña a ignorar los demas.
    //
    // Se lee aqui y no se recibe: quien lo dispara a mano —la API— no tiene por que cargar con la
    // configuracion, y que dos sitios la lean de formas distintas es como empiezan a discrepar.
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const { expirationDigestDays } = tenantSettingsSchema.parse(tenant?.settings ?? {});
    if (expirationDigestDays === 0) return { enviados: 0, motivo: 'APAGADO' };

    const db = this.prisma.forTenant(tenantId);

    /*
      EL HORIZONTE DE LA CONSULTA VA EN MESES Y EL DEL AVISO EN DIAS, asi que se pide de sobra y se
      recorta despues: pedir un mes cuando el aviso mira 45 dias dejaria fuera media ventana. Lo que
      sobra se descarta al resumir, que no cuesta nada.

      Es el MISMO calculo que pinta la pantalla, a proposito: un conteo paralelo "para el aviso"
      acabaria diciendo un numero distinto del que se ve al entrar, y entonces no se creeria ninguno.
    */
    const meses = Math.max(1, Math.ceil(expirationDigestDays / 30) + 1);
    const { items } = await this.reports.vencimientos(meses, hoy, db);

    const resumen = resumirParaElAviso(items, hoy, expirationDigestDays);
    const aviso = redactarAviso(resumen, expirationDigestDays);
    if (!aviso) return { enviados: 0, motivo: 'NADA_QUE_AVISAR' };

    const gente = await db.user.findMany({
      where: {
        active: true,
        deletedAt: null,
        role: { permissions: { some: { permission: { code: 'reports:read_scope' } } } },
      },
      select: { id: true, email: true },
    });
    if (gente.length === 0) return { enviados: 0, motivo: 'NADIE_CON_PERMISO' };

    let destinatarios = gente;
    if (!opciones.forzar) {
      const desde = new Date(hoy.getTime() - 6 * 86_400_000);
      const yaAvisados = await db.notification.findMany({
        where: {
          eventType: ExpirationDigestService.EVENT_TYPE,
          createdAt: { gte: desde },
          recipientUserId: { in: gente.map((quien) => quien.id) },
        },
        select: { recipientUserId: true },
      });
      const avisados = new Set(yaAvisados.map((fila) => fila.recipientUserId));
      destinatarios = gente.filter((quien) => !avisados.has(quien.id));
    }
    if (destinatarios.length === 0) return { enviados: 0, motivo: 'YA_SE_AVISO_ESTA_SEMANA' };

    await this.notifications.notifyMany(
      tenantId,
      destinatarios.map((quien) => ({
        eventType: ExpirationDigestService.EVENT_TYPE,
        recipientUserId: quien.id,
        recipientEmail: quien.email,
        subject: aviso.subject,
        body: aviso.body,
        referenceType: 'reports',
        channels: ['IN_APP' as const],
      })),
    );

    return { enviados: destinatarios.length };
  }
}
