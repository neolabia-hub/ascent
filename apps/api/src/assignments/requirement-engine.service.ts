import { Injectable, Logger } from '@nestjs/common';
import type { AssignmentRule, Prisma } from '@prisma/client';
import { recurrenceSchema, type Recurrence } from '@neo-pulse/shared';
import { AuditService } from '../common/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService, type TenantPrisma } from '../prisma/prisma.service.js';
import { AudiencesService } from './audiences.service.js';
import { computeFirstDueAt, computeNextCycleDueAt, cycleOpensAt, type Trigger } from './due-date.js';

export interface EngineSummary {
  audiencesJoined: number;
  audiencesLeft: number;
  created: number;
  cyclesOpened: number;
  overdue: number;
  withdrawn: number;
}

interface CreatedAssignment {
  userId: string;
  targetId: string;
  dueAt: Date | null;
}

const EMPTY_SUMMARY: EngineSummary = {
  audiencesJoined: 0,
  audiencesLeft: 0,
  created: 0,
  cyclesOpened: 0,
  overdue: 0,
  withdrawn: 0,
};

/**
 * MOTOR DE REQUISITOS (Decision #12).
 *
 * Un requisito no es una lista de tareas: es una obligacion VIVA en el tiempo. El motor la
 * traduce a obligaciones concretas por persona y por ronda:
 *
 *   1. quien entro a la audiencia y aun no tiene la obligacion  -> nace la ronda 1
 *   2. quien completo la ronda anterior y el requisito se repite -> nace la ronda N+1
 *      (cuando falta poco para vencer, no el mismo dia)
 *   3. lo que paso de fecha                                      -> queda VENCIDO
 *   4. quien salio de la audiencia                               -> se RETIRA lo pendiente
 *                                                                   (nunca se borra, Decision #11)
 *
 * Es idempotente a proposito: correrlo dos veces no duplica nada (indice unico
 * regla+persona+ronda y `skipDuplicates`). Lo ejecuta el cron y tambien el alta de una persona.
 */
@Injectable()
export class RequirementEngineService {
  private readonly logger = new Logger(RequirementEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audiences: AudiencesService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /** Pasada completa del tenant (cron). */
  async syncTenant(tenantId: string): Promise<EngineSummary> {
    const db = this.prisma.forTenant(tenantId);
    const audienceResult = await this.audiences.reevaluateAll(db, tenantId);
    const generated = await this.generate(db, tenantId, {});
    const overdue = await this.markOverdue(db);
    const withdrawn = await this.withdrawLeavers(db);
    return {
      audiencesJoined: audienceResult.joined,
      audiencesLeft: audienceResult.left,
      created: generated.created,
      cyclesOpened: generated.cyclesOpened,
      overdue,
      withdrawn,
    };
  }

  /**
   * Sincronizacion de UNA persona: es el enganche del alta y del cambio de cargo. Aqui esta el
   * criterio de aceptacion del sprint: al entrar alguien, sus obligaciones nacen solas.
   */
  async syncPerson(tenantId: string, userId: string): Promise<EngineSummary> {
    const db = this.prisma.forTenant(tenantId);
    const audienceResult = await this.audiences.syncPerson(db, tenantId, userId);
    const generated = await this.generate(db, tenantId, { userIds: [userId] });
    const withdrawn = await this.withdrawLeavers(db, userId);
    return {
      ...EMPTY_SUMMARY,
      audiencesJoined: audienceResult.joined,
      audiencesLeft: audienceResult.left,
      created: generated.created,
      cyclesOpened: generated.cyclesOpened,
      withdrawn,
    };
  }

  /**
   * Sincronizacion de un LOTE (carga masiva). Recalcula las audiencias de una pasada en vez de
   * persona por persona: con 300 altas, una consulta por audiencia es mucho mas barato que 300
   * recorridos de todas las audiencias.
   */
  async syncPeople(tenantId: string, userIds: string[]): Promise<EngineSummary> {
    if (userIds.length === 0) return { ...EMPTY_SUMMARY };
    const db = this.prisma.forTenant(tenantId);
    const audienceResult = await this.audiences.reevaluateAll(db, tenantId);
    const generated = await this.generate(db, tenantId, { userIds });
    return {
      ...EMPTY_SUMMARY,
      audiencesJoined: audienceResult.joined,
      audiencesLeft: audienceResult.left,
      created: generated.created,
      cyclesOpened: generated.cyclesOpened,
    };
  }

  /** Igual que `syncPeople` pero sin tumbar el flujo que la llamo si algo falla. */
  async syncPeopleSafely(tenantId: string, userIds: string[]): Promise<void> {
    try {
      await this.syncPeople(tenantId, userIds);
    } catch (error) {
      this.logger.error(`No se pudieron generar las obligaciones del lote (${userIds.length})`, error as Error);
    }
  }

  /** Igual que `syncPerson` pero sin tumbar el flujo que la llamo si algo falla. */
  /**
   * Genera las obligaciones de una persona SIN tumbar la operacion que la creo.
   *
   * Tragarse el error es deliberado: dar de alta a alguien no puede fallar porque el motor falle.
   * Lo que NO puede quedarse dentro es la noticia. Antes la unica huella era una linea de log, que
   * en la practica es no enterarse: la persona quedaba creada, sin obligaciones y sin nada que
   * mirar despues. Ahora queda una fila de auditoria, que es donde se buscan las cosas raras.
   */
  async syncPersonSafely(tenantId: string, userId: string): Promise<void> {
    try {
      await this.syncPerson(tenantId, userId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`No se pudieron generar las obligaciones de ${userId}: ${reason}`, error as Error);
      await this.audit
        .record({
          tenantId,
          userId,
          action: 'OBLIGATIONS_SYNC_FAILED',
          resourceType: 'users',
          resourceId: userId,
          newValues: { reason },
        })
        // Si hasta la auditoria falla, no se puede hacer mas que no empeorarlo.
        .catch(() => undefined);
    }
  }

  /** Genera las obligaciones que falten para los requisitos activos. */
  async generate(
    db: TenantPrisma,
    tenantId: string,
    options: { userIds?: string[]; ruleId?: string },
  ): Promise<{ created: number; cyclesOpened: number }> {
    const rules = await db.assignmentRule.findMany({
      where: { active: true, ...(options.ruleId ? { id: options.ruleId } : {}), audience: { active: true } },
    });

    const created: CreatedAssignment[] = [];
    let cyclesOpened = 0;

    for (const rule of rules) {
      const outcome = await this.generateForRule(db, tenantId, rule, options.userIds);
      created.push(...outcome.created);
      cyclesOpened += outcome.cyclesOpened;
    }

    if (created.length > 0) {
      await this.announce(db, tenantId, created);
    }
    return { created: created.length, cyclesOpened };
  }

  private async generateForRule(
    db: TenantPrisma,
    tenantId: string,
    rule: AssignmentRule,
    userIds?: string[],
  ): Promise<{ created: CreatedAssignment[]; cyclesOpened: number }> {
    const members = await db.audienceMember.findMany({
      where: {
        audienceId: rule.audienceId,
        leftAt: null,
        ...(userIds ? { userId: { in: userIds } } : {}),
      },
      select: { userId: true, joinedAt: true, user: { select: { hiredAt: true } } },
    });
    if (members.length === 0) return { created: [], cyclesOpened: 0 };

    const existing = await db.assignment.findMany({
      where: { ruleId: rule.id, userId: { in: members.map((m) => m.userId) } },
      select: { userId: true, cycleNumber: true, status: true, dueAt: true, completedAt: true },
      orderBy: { cycleNumber: 'asc' },
    });
    const byUser = new Map<string, typeof existing>();
    for (const row of existing) {
      const rows = byUser.get(row.userId) ?? [];
      rows.push(row);
      byUser.set(row.userId, rows);
    }

    const recurrence = this.parseRecurrence(rule.recurrence);
    const now = new Date();
    const rows: Prisma.AssignmentCreateManyInput[] = [];
    const created: CreatedAssignment[] = [];
    let cyclesOpened = 0;

    for (const member of members) {
      const history = byUser.get(member.userId) ?? [];

      if (history.length === 0) {
        const dueAt = computeFirstDueAt(rule.trigger as Trigger, rule.dueDaysAfterTrigger ?? 0, {
          hiredAt: member.user.hiredAt,
          joinedAt: member.joinedAt,
          recurrence,
        });
        rows.push(this.newRow(tenantId, rule, member.userId, 1, dueAt));
        created.push({ userId: member.userId, targetId: rule.targetId, dueAt });
        continue;
      }

      if (!recurrence) continue;

      // Solo se abre la ronda siguiente cuando la anterior quedo cumplida.
      const last = history[history.length - 1];
      if (!last || last.status !== 'COMPLETED') continue;

      const anchor = last.completedAt ?? last.dueAt ?? now;
      const nextDueAt = computeNextCycleDueAt(recurrence, anchor);
      if (now < cycleOpensAt(nextDueAt, recurrence)) continue;

      rows.push(this.newRow(tenantId, rule, member.userId, last.cycleNumber + 1, nextDueAt));
      created.push({ userId: member.userId, targetId: rule.targetId, dueAt: nextDueAt });
      cyclesOpened += 1;
    }

    if (rows.length > 0) {
      // skipDuplicates + indice unico (regla, persona, ronda): dos ejecuciones simultaneas del
      // cron y del alta no pueden crear la misma obligacion dos veces.
      await db.assignment.createMany({ data: rows, skipDuplicates: true });
    }
    return { created, cyclesOpened };
  }

  private newRow(
    tenantId: string,
    rule: AssignmentRule,
    userId: string,
    cycleNumber: number,
    dueAt: Date,
  ): Prisma.AssignmentCreateManyInput {
    return {
      tenantId,
      userId,
      targetType: rule.targetType,
      targetId: rule.targetId,
      source: 'RULE',
      ruleId: rule.id,
      cycleNumber,
      dueAt,
      status: 'PENDING',
    };
  }

  /** Lo que paso de fecha queda VENCIDO: el indicador de cumplimiento no se infla solo. */
  async markOverdue(db: TenantPrisma): Promise<number> {
    const result = await db.assignment.updateMany({
      where: { status: { in: ['PENDING', 'IN_PROGRESS'] }, dueAt: { lt: new Date() } },
      data: { status: 'OVERDUE' },
    });
    return result.count;
  }

  /**
   * Quien salio de la audiencia (cambio de cargo, retiro) deja de estar obligado. Lo PENDIENTE
   * se retira con motivo; lo que ya estaba EN CURSO se respeta, porque hay trabajo hecho.
   */
  async withdrawLeavers(db: TenantPrisma, userId?: string): Promise<number> {
    const rules = await db.assignmentRule.findMany({ select: { id: true, audienceId: true, active: true } });
    let withdrawn = 0;
    for (const rule of rules) {
      const where = {
        ruleId: rule.id,
        status: { in: ['PENDING' as const, 'OVERDUE' as const] },
        ...(userId ? { userId } : {}),
        ...(rule.active
          ? { user: { audienceMembers: { none: { audienceId: rule.audienceId, leftAt: null } } } }
          : {}),
      };

      // A QUIEN se le retira y DE QUE, antes de retirarlo: hace falta para apagar sus avisos, y
      // despues del update ya no hay forma de saberlo sin volver a adivinar.
      const afectados = await db.assignment.findMany({ where, select: { userId: true, targetId: true } });

      const result = await db.assignment.updateMany({ where, data: { status: 'WITHDRAWN_LEFT_AUDIENCE' } });
      withdrawn += result.count;

      // EL AVISO DE ALGO QUE YA NO SE EXIGE DEJA DE PEDIR ATENCION. Este es exactamente el caso
      // que confundio al cliente: la campana decia "se te asigno X", X ya no estaba entre sus
      // pendientes, y el aviso seguia sin leer reclamandolo. Se marca leido —no se borra: eso lo
      // hace el ciclo de retencion a los 30 dias— porque mientras tanto es la unica frase que
      // explica por que alguien creyo tener esa formacion.
      if (afectados.length > 0) {
        await db.notification.updateMany({
          where: {
            channel: 'IN_APP',
            readAt: null,
            referenceType: 'activities',
            OR: afectados.map((fila) => ({ recipientUserId: fila.userId, referenceId: fila.targetId })),
          },
          data: { readAt: new Date() },
        });
      }
    }
    return withdrawn;
  }

  /**
   * UN aviso por persona con todo lo que le nacio, no uno por obligacion: una carga masiva de
   * 300 personas no puede convertirse en 300 correos por cabeza.
   */
  private async announce(db: TenantPrisma, tenantId: string, created: CreatedAssignment[]): Promise<void> {
    const titleById = await this.resolveTargetTitles(db, [...new Set(created.map((c) => c.targetId))]);
    const byUser = new Map<string, CreatedAssignment[]>();
    for (const item of created) {
      const list = byUser.get(item.userId) ?? [];
      list.push(item);
      byUser.set(item.userId, list);
    }

    const users = await db.user.findMany({
      where: { id: { in: [...byUser.keys()] } },
      select: { id: true, email: true },
    });

    for (const user of users) {
      const items = byUser.get(user.id) ?? [];
      const titles = items.map((i) => titleById.get(i.targetId) ?? 'Actividad formativa').slice(0, 5);
      const extra = items.length > titles.length ? ` y ${items.length - titles.length} mas` : '';
      await this.notifications.notify(tenantId, {
        eventType: 'ASSIGNMENT_CREATED',
        recipientUserId: user.id,
        recipientEmail: user.email,
        subject: items.length === 1 ? 'Tienes una formacion asignada' : `Tienes ${items.length} formaciones asignadas`,
        body: `Se te asigno: ${titles.join(', ')}${extra}.`,
        // A la FORMACION concreta cuando es UNA. Si el ciclo asigno varias de golpe no hay una
        // sola a la que llevar, y el aviso lleva a Mi formacion, que es donde estan todas.
        referenceType: 'activities',
        referenceId: items.length === 1 ? (items[0]?.targetId ?? null) : null,
      });
    }
  }

  private async resolveTargetTitles(db: TenantPrisma, targetIds: string[]): Promise<Map<string, string>> {
    const activities = await db.activity.findMany({
      where: { id: { in: targetIds } },
      select: { id: true, name: true },
    });
    return new Map(activities.map((a) => [a.id, a.name]));
  }

  parseRecurrence(raw: Prisma.JsonValue | null): Recurrence | null {
    if (raw === null || raw === undefined) return null;
    const parsed = recurrenceSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }
}
