import { Injectable } from '@nestjs/common';
import { tenantSettingsSchema } from '@neo-pulse/shared';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { redactarAvisoDeRepaso, resumirParaElAvisoDeRepaso, type PreguntaVencida } from './review-digest.js';

/**
 * QUIEN MANDA EL AVISO DE REPASO, Y A QUIEN (`PENDIENTES` 5.1).
 *
 * ─── LA DIFERENCIA CON EL AVISO DE VENCIMIENTOS ───
 *
 * Vencimientos manda UN aviso por administrador, resumiendo a TODA la empresa. Este manda un aviso
 * a CADA aprendiz, sobre SU cola de repaso — son universos distintos: uno informa a quien gestiona,
 * el otro empuja a quien tiene que estudiar. Por eso no reutiliza `ExpirationDigestService`, aunque
 * la forma (leer settings, resumir, redactar, dedupe, mandar) sea la misma.
 *
 * ─── POR QUE VIVE EN `engagement/` Y SE REGISTRA EN `ReportsModule` ───
 *
 * El dominio es de repeticion espaciada (junto a `spaced-repetition.ts`), pero el patron de
 * "servicio que un worker dispara por cron y un endpoint dispara a mano" ya esta montado en
 * `ReportsModule` para el aviso de vencimientos, y separarlo en un modulo propio solo para esto no
 * pagaba la ceremonia. Si `engagement/` gana un tercer aviso, ahi si vale la pena moverlos juntos.
 */
@Injectable()
export class ReviewDigestService {
  /** Tipo propio: es lo que permite saber si a esta persona ya se le aviso hoy. */
  static readonly EVENT_TYPE = 'REVIEW_DUE_DIGEST';

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Manda el aviso de un tenant a quien tenga suficientes preguntas vencidas. Devuelve a cuantos.
   *
   * `forzar` salta la comprobacion de "ya se le aviso hoy", igual que en Vencimientos: existe para
   * que un reinicio del servidor no duplique el aviso, y se salta al pedirlo a mano porque ahi se
   * quiere justamente verlo.
   */
  async enviar(tenantId: string, opciones: { hoy?: Date; forzar?: boolean } = {}): Promise<{ enviados: number; motivo?: string }> {
    const hoy = opciones.hoy ?? new Date();

    // El umbral lo decide el tenant, igual que `expirationDigestDays`. 0 = apagado. Se lee aqui y
    // no se recibe por parametro: quien lo dispara a mano no tiene por que cargar con el settings.
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
    const { reviewDigestMinDue } = tenantSettingsSchema.parse(tenant?.settings ?? {});
    if (reviewDigestMinDue === 0) return { enviados: 0, motivo: 'APAGADO' };

    const db = this.prisma.forTenant(tenantId);

    /*
      UNA CONSULTA PARA TODO EL TENANT, no una por persona. Con seiscientos aprendices, preguntar
      uno a uno serian seiscientas idas a la base solo para saber quien tiene cuantas vencidas —el
      mismo error de fondo que ya se corrigio en `ejecucionDeActividad` con `estadosPorActividad`.

      `review_queue` no tiene relacion inversa hacia `question_versions` (es un id suelto, como
      hace tambien `engagement.service.ts` en `todayReview`), asi que el tema se trae APARTE con un
      segundo `IN`: mas barato que un join que Prisma no puede expresar aqui.
    */
    const vencidas = await db.reviewQueueItem.findMany({
      where: { retired: false, dueAt: { lte: hoy } },
      select: { userId: true, dueAt: true, questionVersionId: true },
    });
    if (vencidas.length === 0) return { enviados: 0, motivo: 'NADA_QUE_AVISAR' };

    const versiones = await db.questionVersion.findMany({
      where: { id: { in: [...new Set(vencidas.map((fila) => fila.questionVersionId))] } },
      select: { id: true, question: { select: { category: { select: { name: true } } } } },
    });
    const temaPorVersion = new Map(versiones.map((v) => [v.id, v.question.category?.name ?? null]));

    const porPersona = new Map<string, PreguntaVencida[]>();
    for (const fila of vencidas) {
      const lista = porPersona.get(fila.userId) ?? [];
      lista.push({ tema: temaPorVersion.get(fila.questionVersionId) ?? null, dueAt: fila.dueAt });
      porPersona.set(fila.userId, lista);
    }

    // Solo quien de verdad llega al umbral pasa a pedir su nombre/correo: evita traer a toda la
    // empresa cuando la mayoria no tiene ni una vencida.
    const candidatos = [...porPersona.entries()].filter(([, preguntas]) => preguntas.length >= reviewDigestMinDue);
    if (candidatos.length === 0) return { enviados: 0, motivo: 'NADIE_LLEGA_AL_UMBRAL' };

    let destinatarios = candidatos;
    if (!opciones.forzar) {
      const desde = new Date(hoy.getTime() - 20 * 60 * 60 * 1000); // ~un dia, con margen
      const yaAvisados = await db.notification.findMany({
        where: {
          eventType: ReviewDigestService.EVENT_TYPE,
          createdAt: { gte: desde },
          recipientUserId: { in: candidatos.map(([userId]) => userId) },
        },
        select: { recipientUserId: true },
      });
      const avisados = new Set(yaAvisados.map((fila) => fila.recipientUserId));
      destinatarios = candidatos.filter(([userId]) => !avisados.has(userId));
    }
    if (destinatarios.length === 0) return { enviados: 0, motivo: 'YA_SE_AVISO_HOY' };

    const gente = await db.user.findMany({
      where: { id: { in: destinatarios.map(([userId]) => userId) }, active: true, deletedAt: null },
      select: { id: true, email: true },
    });
    const correoPorUsuario = new Map(gente.map((persona) => [persona.id, persona.email]));

    const avisos = destinatarios
      .map(([userId, preguntas]) => {
        const correo = correoPorUsuario.get(userId);
        if (!correo) return null; // dio de baja o quedo inactivo entre la consulta y el envio
        const aviso = redactarAvisoDeRepaso(resumirParaElAvisoDeRepaso(preguntas), reviewDigestMinDue);
        if (!aviso) return null;
        return {
          eventType: ReviewDigestService.EVENT_TYPE,
          recipientUserId: userId,
          recipientEmail: correo,
          subject: aviso.subject,
          body: aviso.body,
          referenceType: 'review',
          // Solo bandeja, igual que Vencimientos: es un empuje suave, no algo que exija correo.
          channels: ['IN_APP' as const],
        };
      })
      .filter((aviso): aviso is NonNullable<typeof aviso> => aviso !== null);

    if (avisos.length === 0) return { enviados: 0, motivo: 'NADA_QUE_AVISAR' };

    await this.notifications.notifyMany(tenantId, avisos);
    return { enviados: avisos.length };
  }
}
