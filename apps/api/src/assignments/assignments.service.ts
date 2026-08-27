import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateAssignmentInput,
  CreateAssignmentRuleInput,
  ListAssignmentsQuery,
  ToggleJobTitleMatrixInput,
  UpdateAssignmentRuleInput,
  WaiveAssignmentInput,
} from '@neo-pulse/shared';
import { AuditService } from '../common/audit.service.js';
import type { AuthUser } from '../common/types.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ELIGIBLE_MEMBER, singleJobTitleOf } from './audience-rule.js';
import { AudiencesService } from './audiences.service.js';
import { endOfDay, type CalendarDate } from './due-date.js';
import { RequirementEngineService } from './requirement-engine.service.js';

/** Estados en los que la obligacion sigue viva (no se duplica ni se reasigna encima). */
const OPEN_STATUSES: Prisma.EnumAssignmentStatusFilter = { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE'] };

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly audiences: AudiencesService,
    private readonly engine: RequirementEngineService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─────────────────────────── Requisitos (reglas) ───────────────────────────

  async listRules() {
    const rules = await this.prisma.scoped.assignmentRule.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        audience: { select: { id: true, name: true, active: true } },
        _count: { select: { assignments: true } },
      },
    });
    const titles = await this.resolveActivityTitles(rules.map((r) => r.targetId));
    return rules.map((rule) => ({
      id: rule.id,
      audience: rule.audience,
      targetType: rule.targetType,
      targetId: rule.targetId,
      targetName: titles.get(rule.targetId) ?? null,
      trigger: rule.trigger,
      dueDaysAfterTrigger: rule.dueDaysAfterTrigger,
      recurrence: rule.recurrence,
      active: rule.active,
      assignmentCount: rule._count.assignments,
      createdAt: rule.createdAt,
    }));
  }

  async createRule(actor: AuthUser, input: CreateAssignmentRuleInput) {
    const tenantId = this.prisma.currentTenantId;
    await this.assertTargetExists(input.targetType, input.targetId);

    const audience = await this.prisma.scoped.audience.findUnique({ where: { id: input.audienceId } });
    if (!audience) throw new NotFoundException({ code: 'AUDIENCE_NOT_FOUND' });

    const duplicate = await this.prisma.scoped.assignmentRule.findFirst({
      where: { audienceId: input.audienceId, targetId: input.targetId, active: true },
    });
    if (duplicate) {
      throw new ConflictException({
        code: 'RULE_ALREADY_EXISTS',
        message: 'Esa audiencia ya tiene este requisito activo.',
      });
    }

    const rule = await this.prisma.scoped.assignmentRule.create({
      data: {
        tenantId,
        audienceId: input.audienceId,
        targetType: input.targetType,
        targetId: input.targetId,
        trigger: input.trigger,
        dueDaysAfterTrigger: input.dueDaysAfterTrigger,
        recurrence: (input.recurrence ?? null) as Prisma.InputJsonValue,
        createdBy: actor.id,
      },
    });

    // Un requisito nuevo obliga desde YA a quien ya pertenece a la audiencia.
    const generated = await this.engine.generate(this.prisma.scoped, tenantId, { ruleId: rule.id });

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'ASSIGNMENT_RULE_CREATED',
      resourceType: 'assignment_rules',
      resourceId: rule.id,
      newValues: { ...input, generated: generated.created },
    });
    return { rule, generated: generated.created };
  }

  async updateRule(actor: AuthUser, id: string, input: UpdateAssignmentRuleInput) {
    const tenantId = this.prisma.currentTenantId;
    const before = await this.prisma.scoped.assignmentRule.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ code: 'RULE_NOT_FOUND' });

    const rule = await this.prisma.scoped.assignmentRule.update({
      where: { id },
      data: {
        dueDaysAfterTrigger: input.dueDaysAfterTrigger,
        recurrence: input.recurrence === undefined ? undefined : ((input.recurrence ?? null) as Prisma.InputJsonValue),
        active: input.active,
      },
    });

    // Retirar el requisito retira lo PENDIENTE (queda con motivo, no se borra).
    if (input.active === false) {
      await this.engine.withdrawLeavers(this.prisma.scoped);
    }
    if (input.active === true) {
      await this.engine.generate(this.prisma.scoped, tenantId, { ruleId: id });
    }

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'ASSIGNMENT_RULE_UPDATED',
      resourceType: 'assignment_rules',
      resourceId: id,
      oldValues: { dueDaysAfterTrigger: before.dueDaysAfterTrigger, recurrence: before.recurrence, active: before.active },
      newValues: input,
    });
    return rule;
  }

  // ─────────────────────────── Matriz cargo -> actividad ───────────────────────────

  /**
   * La forma corta de declarar las inducciones especificas: una cuadricula cargo x actividad.
   * Cada casilla encendida es, por debajo, una audiencia de ese cargo y un requisito de ingreso.
   */
  async jobTitleMatrix() {
    const [jobTitles, activities, rules, audiences] = await Promise.all([
      this.prisma.scoped.jobTitle.findMany({
        where: { active: true },
        orderBy: { name: 'asc' },
        select: { id: true, code: true, name: true, jobTitleType: { select: { name: true } } },
      }),
      this.prisma.scoped.activity.findMany({
        where: { active: true, deletedAt: null },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          code: true,
          name: true,
          activityType: { select: { code: true, name: true, colorHex: true } },
        },
      }),
      this.prisma.scoped.assignmentRule.findMany({ where: { active: true, targetType: 'ACTIVITY' } }),
      this.prisma.scoped.audience.findMany({ where: { active: true } }),
    ]);

    const jobTitleByAudience = new Map<string, string>();
    for (const audience of audiences) {
      const jobTitleId = singleJobTitleOf(this.audiences.parseRule(audience.rule));
      if (jobTitleId) jobTitleByAudience.set(audience.id, jobTitleId);
    }

    const cells = rules
      .map((rule) => {
        const jobTitleId = jobTitleByAudience.get(rule.audienceId);
        return jobTitleId
          ? {
              jobTitleId,
              activityId: rule.targetId,
              ruleId: rule.id,
              trigger: rule.trigger,
              dueDaysAfterTrigger: rule.dueDaysAfterTrigger,
            }
          : null;
      })
      .filter((cell): cell is NonNullable<typeof cell> => cell !== null);

    // Requisitos que alcanzan cargos desde audiencias mas amplias: la matriz no los administra,
    // pero callarlos haria creer que un cargo no tiene nada exigido.
    const broaderRules = rules.filter((rule) => !jobTitleByAudience.has(rule.audienceId)).length;

    return { jobTitles, activities, cells, broaderRules };
  }

  async toggleJobTitleMatrix(actor: AuthUser, input: ToggleJobTitleMatrixInput) {
    const tenantId = this.prisma.currentTenantId;
    const jobTitle = await this.prisma.scoped.jobTitle.findUnique({ where: { id: input.jobTitleId } });
    if (!jobTitle) throw new NotFoundException({ code: 'JOB_TITLE_NOT_FOUND' });
    await this.assertTargetExists('ACTIVITY', input.activityId);

    const audience = await this.findOrCreateJobTitleAudience(tenantId, input.jobTitleId, jobTitle.name);
    const existing = await this.prisma.scoped.assignmentRule.findFirst({
      where: { audienceId: audience.id, targetId: input.activityId },
    });

    if (!input.enabled) {
      if (existing?.active) {
        await this.updateRule(actor, existing.id, { active: false });
      }
      return { enabled: false as const, ruleId: existing?.id ?? null };
    }

    if (existing) {
      const rule = await this.updateRule(actor, existing.id, {
        active: true,
        dueDaysAfterTrigger: input.dueDaysAfterTrigger,
      });
      return { enabled: true as const, ruleId: rule.id };
    }

    const created = await this.createRule(actor, {
      audienceId: audience.id,
      targetType: 'ACTIVITY',
      targetId: input.activityId,
      // La induccion especifica se exige al ingresar al cargo (D1072).
      trigger: 'ON_HIRE',
      dueDaysAfterTrigger: input.dueDaysAfterTrigger,
      recurrence: null,
    });
    return { enabled: true as const, ruleId: created.rule.id, generated: created.generated };
  }

  private async findOrCreateJobTitleAudience(tenantId: string, jobTitleId: string, jobTitleName: string) {
    const audiences = await this.prisma.scoped.audience.findMany({ where: { active: true } });
    const found = audiences.find((audience) => singleJobTitleOf(this.audiences.parseRule(audience.rule)) === jobTitleId);
    if (found) return found;

    const created = await this.prisma.scoped.audience.create({
      data: {
        tenantId,
        name: `Cargo: ${jobTitleName}`,
        rule: { match: 'ALL', jobTitleIds: [jobTitleId], jobTitleTypeIds: [], areaIds: [], regionalIds: [], employmentTypes: [], roadActors: [] },
        isDynamic: true,
      },
    });
    await this.audiences.reevaluate(this.prisma.scoped, tenantId, created.id);
    return created;
  }

  // ─────────────────────────── Asignacion manual ───────────────────────────

  /**
   * Asignacion puntual: a personas o a todo un cargo, area o regional (se expande a personas,
   * porque la obligacion siempre es de alguien concreto). No pisa lo que ya esta vivo.
   */
  async createManual(actor: AuthUser, input: CreateAssignmentInput) {
    const tenantId = this.prisma.currentTenantId;
    await this.assertTargetExists(input.targetType, input.targetId);

    const orConditions: Prisma.UserWhereInput[] = [];
    if (input.userIds.length > 0) orConditions.push({ id: { in: input.userIds } });
    if (input.jobTitleIds.length > 0) orConditions.push({ jobTitleId: { in: input.jobTitleIds } });
    if (input.areaIds.length > 0) orConditions.push({ areaId: { in: input.areaIds } });
    if (input.regionalIds.length > 0) orConditions.push({ regionalId: { in: input.regionalIds } });

    const candidates = await this.prisma.scoped.user.findMany({
      where: { ...ELIGIBLE_MEMBER, OR: orConditions },
      select: { id: true, email: true },
    });

    const alreadyObliged = await this.prisma.scoped.assignment.findMany({
      where: {
        targetType: input.targetType,
        targetId: input.targetId,
        status: OPEN_STATUSES,
        userId: { in: candidates.map((u) => u.id) },
      },
      select: { userId: true },
    });
    const skip = new Set(alreadyObliged.map((a) => a.userId));
    const recipients = candidates.filter((user) => !skip.has(user.id));

    const dueAt = input.dueAt ? endOfDay(this.parseDateOnly(input.dueAt)) : null;
    if (recipients.length > 0) {
      await this.prisma.scoped.assignment.createMany({
        data: recipients.map((user) => ({
          tenantId,
          userId: user.id,
          targetType: input.targetType,
          targetId: input.targetId,
          source: 'MANUAL' as const,
          assignedBy: actor.id,
          cycleNumber: 1,
          dueAt,
          status: 'PENDING' as const,
        })),
      });
    }

    const title = (await this.resolveActivityTitles([input.targetId])).get(input.targetId) ?? 'Actividad formativa';
    for (const user of recipients) {
      await this.notifications.notify(tenantId, {
        eventType: 'ASSIGNMENT_CREATED',
        recipientUserId: user.id,
        recipientEmail: user.email,
        subject: 'Tienes una formacion asignada',
        body: `Se te asigno: ${title}.`,
        referenceType: 'assignments',
        referenceId: null,
      });
    }

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'ASSIGNMENTS_CREATED_MANUAL',
      resourceType: 'assignments',
      resourceId: input.targetId,
      newValues: { created: recipients.length, skipped: skip.size, dueAt: input.dueAt ?? null },
    });
    return { created: recipients.length, skipped: skip.size };
  }

  async list(query: ListAssignmentsQuery) {
    const where: Prisma.AssignmentWhereInput = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.targetId ? { targetId: query.targetId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.overdueOnly === 'true' ? { status: 'OVERDUE' } : {}),
      ...(query.areaId || query.jobTitleId || query.q
        ? {
            user: {
              ...(query.areaId ? { areaId: query.areaId } : {}),
              ...(query.jobTitleId ? { jobTitleId: query.jobTitleId } : {}),
              ...(query.q
                ? {
                    OR: [
                      { fullName: { contains: query.q, mode: 'insensitive' as const } },
                      { documentNumber: { contains: query.q } },
                    ],
                  }
                : {}),
            },
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.scoped.assignment.count({ where }),
      this.prisma.scoped.assignment.findMany({
        where,
        orderBy: [{ dueAt: 'asc' }, { assignedAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          targetType: true,
          targetId: true,
          source: true,
          cycleNumber: true,
          dueAt: true,
          status: true,
          assignedAt: true,
          completedAt: true,
          waivedReason: true,
          user: {
            select: {
              id: true,
              fullName: true,
              documentNumber: true,
              jobTitle: { select: { name: true } },
              area: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    const titles = await this.resolveActivityTitles(items.map((i) => i.targetId));
    return {
      total,
      page: query.page,
      pageSize: query.pageSize,
      items: items.map((item) => ({ ...item, targetName: titles.get(item.targetId) ?? null })),
    };
  }

  /** Eximir: la obligacion deja de contar, pero queda con motivo y autor para el auditor. */
  async waive(actor: AuthUser, id: string, input: WaiveAssignmentInput) {
    const assignment = await this.prisma.scoped.assignment.findUnique({ where: { id } });
    if (!assignment) throw new NotFoundException({ code: 'ASSIGNMENT_NOT_FOUND' });
    if (assignment.status === 'COMPLETED') {
      throw new ConflictException({ code: 'ASSIGNMENT_ALREADY_COMPLETED' });
    }

    const updated = await this.prisma.scoped.assignment.update({
      where: { id },
      data: { status: 'WAIVED', waivedBy: actor.id, waivedReason: input.waivedReason },
    });
    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: 'ASSIGNMENT_WAIVED',
      resourceType: 'assignments',
      resourceId: id,
      oldValues: { status: assignment.status },
      newValues: { status: 'WAIVED', waivedReason: input.waivedReason },
    });
    return updated;
  }

  // ─────────────────────────── Apoyo ───────────────────────────

  private async assertTargetExists(targetType: string, targetId: string): Promise<void> {
    if (targetType !== 'ACTIVITY') {
      // Rutas y certificaciones existen en el modelo; su motor llega en sprints posteriores.
      throw new ConflictException({
        code: 'TARGET_TYPE_NOT_SUPPORTED',
        message: 'Por ahora solo se exigen actividades formativas.',
      });
    }
    const activity = await this.prisma.scoped.activity.findFirst({
      where: { id: targetId, deletedAt: null },
      select: { id: true },
    });
    if (!activity) throw new NotFoundException({ code: 'ACTIVITY_NOT_FOUND' });
  }

  private async resolveActivityTitles(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const activities = await this.prisma.scoped.activity.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, name: true },
    });
    return new Map(activities.map((a) => [a.id, a.name]));
  }

  /** AAAA-MM-DD de la UI a fecha civil, sin pasar por instantes (evita correrla un dia). */
  private parseDateOnly(value: string): CalendarDate {
    const [year, month, day] = value.split('-').map(Number) as [number, number, number];
    return { year, month, day };
  }
}
