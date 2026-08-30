import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type PlanItemStatus } from '@prisma/client';
import type {
  AddPlanItemInput,
  ApprovePlanInput,
  CreateTrainingPlanInput,
  DeletePlanInput,
  ListPlansQuery,
  UpdatePlanItemInput,
  UpdateTrainingPlanInput,
} from '@neo-pulse/shared';
import { offeringScopeWhere } from '../common/analyst-scope.js';
import { AuditService } from '../common/audit.service.js';
import type { AuthUser } from '../common/types.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { decidePlanDeletion, deletionNeedsJustification } from './plan-deletion.js';
import { ProjectedAudienceService } from '../offerings/projected-audience.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { computePlanMetrics, type PlanItemFacts } from './plan-metrics.js';

/** Lo minimo que hace falta de un renglon para materializarlo (ver `materialize`). */
interface PlanItemToMaterialize {
  id: string;
  plannedMonth: number;
  status: PlanItemStatus;
  offering: {
    projectedCount: number | null;
    regionalId: string | null;
    activityVersion: { activityId: string; activity: { name: string } };
  };
}

/** Ejecuciones que cuentan como "capacitado" para la cobertura. */
const TRAINED_STATUSES: Prisma.EnumEnrollmentStatusFilter = { in: ['COMPLETED', 'PASSED'] };

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly projected: ProjectedAudienceService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(query: ListPlansQuery) {
    const plans = await this.prisma.scoped.trainingPlan.findMany({
      where: {
        ...(query.year ? { year: query.year } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: [{ year: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { items: true } } },
    });
    return plans.map((plan) => ({
      id: plan.id,
      year: plan.year,
      name: plan.name,
      status: plan.status,
      approvedAt: plan.approvedAt,
      itemCount: plan._count.items,
      updatedAt: plan.updatedAt,
    }));
  }

  /**
   * El plan que ve QUIEN pregunta.
   *
   * El analista de SST no abre "el plan de la empresa con 52 renglones": abre su parte. Y por eso
   * las metricas se calculan sobre los renglones VISIBLES —ensenarle un 62% de cumplimiento global
   * junto a sus ocho jornadas seria un numero que no puede explicar ni mover—. El administrador,
   * sin alcance, sigue viendo el plan completo y el 62% de verdad.
   */
  async getById(actor: AuthUser, id: string) {
    const scoped = offeringScopeWhere(actor.scopeProcessIds);
    const plan = await this.prisma.scoped.trainingPlan.findUnique({
      where: { id },
      include: {
        items: {
          ...(Object.keys(scoped).length ? { where: { offering: scoped } } : {}),
          orderBy: [{ plannedMonth: 'asc' }],
          include: {
            offering: {
              select: {
                id: true,
                code: true,
                kind: true,
                status: true,
                scheduledDate: true,
                projectedCount: true,
                regional: { select: { id: true, name: true } },
                activityVersion: {
                  select: {
                    // El id hace falta para "otra jornada de esta misma capacitacion": sin el, el plan
                    // no puede preseleccionar la version y obliga a buscarla en un desplegable.
                    id: true,
                    versionNumber: true,
                    activity: {
                      select: {
                        id: true,
                        name: true,
                        process: { select: { id: true, code: true, name: true } },
                        activityType: { select: { code: true, name: true, colorHex: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!plan) throw new NotFoundException({ code: 'PLAN_NOT_FOUND' });

    const facts = await this.factsFor(plan.items.map((item) => ({ id: item.id, plannedMonth: item.plannedMonth, status: item.status, projectedSnapshot: item.projectedSnapshot })));
    const metrics = computePlanMetrics(facts);
    const factsById = new Map(facts.map((fact) => [fact.itemId, fact]));

    return {
      ...plan,
      items: plan.items.map((item) => ({
        ...item,
        facts: factsById.get(item.id) ?? null,
      })),
      metrics,
      /** El mismo plan visto por sistema de gestion: el plan SST, el PESV y el BASC son vistas. */
      byProcess: this.groupByProcess(plan.items, factsById),
    };
  }

  async create(actor: AuthUser, input: CreateTrainingPlanInput) {
    const tenantId = this.prisma.currentTenantId;
    const plan = await this.prisma.scoped.trainingPlan
      .create({
        data: {
          tenantId,
          year: input.year,
          name: input.name,
          objective: input.objective ?? null,
          goals: input.goals ?? null,
          scope: input.scope ?? null,
          createdBy: actor.id,
          updatedBy: actor.id,
        },
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException({ code: 'DUPLICATE_PLAN', message: 'Ya existe un plan con ese nombre para el ano.' });
        }
        throw error;
      });

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'PLAN_CREATED',
      resourceType: 'training_plans',
      resourceId: plan.id,
      newValues: { year: input.year, name: input.name },
    });
    return this.getById(actor, plan.id);
  }

  /**
   * La CABECERA del plan se corrige aunque este aprobado, con motivo.
   *
   * Antes cualquier cambio quedaba congelado al aprobar, y eso protegia de mas: nombre, objetivo,
   * metas y alcance son texto descriptivo —lo que obliga a la gente son los renglones—, asi que
   * bloquearlos no defendia ninguna obligacion; solo dejaba puesto todo el ano un nombre mal
   * escrito. Lo que si sigue cerrado es el plan CERRADO, que ya es la evidencia del ano.
   *
   * El ANO es otra cosa: identifica al plan junto al nombre y ancla el vencimiento de cada
   * renglon al ultimo dia de su mes. Cambiarlo despues de aprobar moveria la fecha limite de
   * gente que ya tiene la obligacion encima, asi que solo se toca en borrador.
   */
  async update(actor: AuthUser, id: string, input: UpdateTrainingPlanInput) {
    const plan = await this.requirePlan(id);
    if (plan.status === 'CLOSED') {
      throw new ConflictException({
        code: 'PLAN_CLOSED',
        message: 'El plan cerrado es la evidencia del ano: ya no se edita.',
      });
    }
    if (plan.status !== 'DRAFT') {
      if (!input.justification) {
        throw new ConflictException({
          code: 'PLAN_JUSTIFICATION_REQUIRED',
          message: 'El plan ya esta aprobado: para corregir su cabecera hay que decir por que.',
        });
      }
      if (input.year !== undefined && input.year !== plan.year) {
        throw new ConflictException({
          code: 'PLAN_YEAR_LOCKED',
          message: 'El ano de un plan aprobado no se cambia: moveria el vencimiento de obligaciones ya vigentes.',
        });
      }
    }

    await this.prisma.scoped.trainingPlan
      .update({
        where: { id },
        data: {
          year: plan.status === 'DRAFT' ? input.year : undefined,
          name: input.name,
          objective: input.objective,
          goals: input.goals,
          scope: input.scope,
          updatedBy: actor.id,
          version: { increment: 1 },
        },
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException({ code: 'DUPLICATE_PLAN', message: 'Ya existe un plan con ese nombre para el ano.' });
        }
        throw error;
      });
    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: 'PLAN_UPDATED',
      resourceType: 'training_plans',
      resourceId: id,
      oldValues: { name: plan.name, year: plan.year, objective: plan.objective, status: plan.status },
      newValues: input,
    });
    return this.getById(actor, id);
  }

  /**
   * BORRAR el plan entero. La decision vive en `plan-deletion.ts`, pura y probada; aqui solo se
   * reunen los hechos y se ejecuta.
   *
   * Cuando el plan ya obligaba a alguien, borrarlo REVOCA esas obligaciones: se borran sus
   * asignaciones (source = PLAN) en la misma transaccion. No se pueden dejar huerfanas —apuntan
   * al renglon por clave foranea— y tampoco vivas: una obligacion sin plan que la explique es
   * justo lo que el plan existe para evitar.
   *
   * Va con `plans:approve` y no con `plans:manage`: borrar el plan del ano es al menos tan grave
   * como aprobarlo.
   */
  async remove(actor: AuthUser, id: string, input: DeletePlanInput) {
    const tenantId = this.prisma.currentTenantId;
    const plan = await this.prisma.scoped.trainingPlan.findUnique({
      where: { id },
      include: { items: { select: { id: true } } },
    });
    if (!plan) throw new NotFoundException({ code: 'PLAN_NOT_FOUND' });

    const itemIds = plan.items.map((item) => item.id);
    const assignments = itemIds.length
      ? await this.prisma.scoped.assignment.findMany({
          where: { planItemId: { in: itemIds }, source: 'PLAN' },
          select: { id: true },
        })
      : [];
    // "Empezar" es haber abierto la formacion: la inscripcion solo nace cuando la persona entra.
    // Con una basta para bloquear, pero se cuentan todas para poder DECIR cuantas son, que es lo
    // que hace entendible el rechazo en pantalla.
    const started = assignments.length
      ? await this.prisma.scoped.enrollment.count({ where: { assignmentId: { in: assignments.map((a) => a.id) } } })
      : 0;

    const verdict = decidePlanDeletion({ status: plan.status, obligations: assignments.length, started });
    if (!verdict.allowed) {
      throw new ConflictException({ code: verdict.code, message: verdict.message });
    }
    if (deletionNeedsJustification(plan.status) && !input.justification) {
      throw new ConflictException({
        code: 'PLAN_JUSTIFICATION_REQUIRED',
        message: 'El plan ya fue aprobado: para borrarlo hay que decir por que.',
      });
    }

    await this.prisma.tx(async (tx) => {
      if (assignments.length > 0) {
        await tx.assignment.deleteMany({ where: { id: { in: assignments.map((a) => a.id) } } });
      }
      // Los renglones caen con el plan (onDelete: Cascade en plan_items.plan_id).
      await tx.trainingPlan.delete({ where: { id } });
    });

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'PLAN_DELETED',
      resourceType: 'training_plans',
      resourceId: id,
      oldValues: { year: plan.year, name: plan.name, status: plan.status, items: itemIds.length },
      newValues: { revokedAssignments: verdict.revokes, justification: input.justification ?? null },
    });
    return { ok: true as const, revokedAssignments: verdict.revokes };
  }

  // ─────────────────────────── Renglones ───────────────────────────

  /**
   * El renglon REFERENCIA una convocatoria; el plan no posee la actividad (Decision #3).
   *
   * Se puede agregar con el plan YA APROBADO, con justificacion (Decision #55). La regla anterior
   * —"el plan aprobado no se edita"— era correcta en su intencion y demasiado apretada en la
   * practica: si en agosto abren una regional, esa jornada tiene que entrar en el plan del ano.
   * Prohibirlo no evita el cambio, lo saca del sistema, que es justo lo que el plan existe para
   * impedir. AGREGAR no reescribe el pasado; BORRAR si, y eso sigue prohibido.
   */
  async addItem(actor: AuthUser, planId: string, input: AddPlanItemInput) {
    const tenantId = this.prisma.currentTenantId;
    const plan = await this.requirePlan(planId);
    if (plan.status === 'CLOSED') {
      throw new ConflictException({
        code: 'PLAN_CLOSED',
        message: 'El plan del ano esta cerrado: ya es historia y no admite renglones nuevos.',
      });
    }
    const live = plan.status !== 'DRAFT';
    if (live && !input.justification) {
      throw new ConflictException({
        code: 'PLAN_JUSTIFICATION_REQUIRED',
        message: 'El plan ya esta aprobado: para agregar una jornada hay que decir por que.',
      });
    }

    const offering = await this.prisma.scoped.offering.findUnique({
      where: { id: input.offeringId },
      select: {
        id: true,
        code: true,
        status: true,
        scheduledDate: true,
        projectedCount: true,
        regionalId: true,
        activityVersion: { select: { activityId: true, activity: { select: { name: true } } } },
      },
    });
    if (!offering) throw new NotFoundException({ code: 'OFFERING_NOT_FOUND' });
    if (offering.status === 'CANCELLED') {
      throw new ConflictException({ code: 'OFFERING_CANCELLED', message: 'Esa convocatoria esta cancelada.' });
    }


    const duplicate = await this.prisma.scoped.planItem.findFirst({
      where: { planId, offeringId: input.offeringId },
    });
    if (duplicate) {
      throw new ConflictException({ code: 'PLAN_ITEM_DUPLICATED', message: 'Esa convocatoria ya esta en el plan.' });
    }

    const item = await this.prisma.scoped.planItem.create({
      data: {
        tenantId,
        planId,
        offeringId: input.offeringId,
        plannedMonth: input.plannedMonth,
        notes: input.notes ?? null,
      },
    });
    // En un plan vivo el renglon nace ya obligando: congela proyectados y crea las asignaciones.
    // Si la convocatoria aun esta en borrador, el numero sale de la regla de audiencia y al
    // publicarla se sincroniza (ver `publish`): pedirle al usuario que publique primero romperia
    // el camino natural, que es crear la jornada desde el propio plan.
    let assignments = 0;
    if (live) {
      const perUser = new Map<string, string[]>();
      assignments = await this.materialize(actor, tenantId, plan.year, { ...item, offering }, perUser);
      await this.announce(tenantId, perUser, plan.year);
    }

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'PLAN_ITEM_ADDED',
      resourceType: 'plan_items',
      resourceId: item.id,
      newValues: {
        planId,
        offering: offering.code,
        plannedMonth: input.plannedMonth,
        planStatus: plan.status,
        justification: input.justification ?? null,
        assignments,
      },
    });
    return this.getById(actor, planId);
  }

  async updateItem(actor: AuthUser, itemId: string, input: UpdatePlanItemInput) {
    const item = await this.prisma.scoped.planItem.findUnique({ where: { id: itemId }, include: { plan: true } });
    if (!item) throw new NotFoundException({ code: 'PLAN_ITEM_NOT_FOUND' });
    if (item.plan.status === 'CLOSED') {
      throw new ConflictException({ code: 'PLAN_CLOSED' });
    }
    if (item.status === 'EXECUTED') {
      throw new ConflictException({
        code: 'PLAN_ITEM_EXECUTED',
        message: 'Un renglon ya ejecutado no se reprograma: quedo como historia.',
      });
    }

    // Mover el mes es REPROGRAMAR, y se dice: el indicador debe distinguir lo que se movio.
    const rescheduled = input.plannedMonth !== undefined && input.plannedMonth !== item.plannedMonth;
    const updated = await this.prisma.scoped.planItem.update({
      where: { id: itemId },
      data: {
        plannedMonth: input.plannedMonth,
        notes: input.notes,
        status: input.status ?? (rescheduled ? 'RESCHEDULED' : undefined),
      },
    });
    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: rescheduled ? 'PLAN_ITEM_RESCHEDULED' : 'PLAN_ITEM_UPDATED',
      resourceType: 'plan_items',
      resourceId: itemId,
      oldValues: { plannedMonth: item.plannedMonth, status: item.status },
      newValues: input,
    });
    return updated;
  }

  async removeItem(actor: AuthUser, itemId: string) {
    const item = await this.prisma.scoped.planItem.findUnique({ where: { id: itemId }, include: { plan: true } });
    if (!item) throw new NotFoundException({ code: 'PLAN_ITEM_NOT_FOUND' });
    this.assertEditable(item.plan.status);

    const withAssignments = await this.prisma.scoped.assignment.count({ where: { planItemId: itemId } });
    if (withAssignments > 0) {
      throw new ConflictException({
        code: 'PLAN_ITEM_IN_USE',
        message: 'El renglon ya genero obligaciones: cancelalo en vez de borrarlo.',
      });
    }

    await this.prisma.scoped.planItem.delete({ where: { id: itemId } });
    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: 'PLAN_ITEM_REMOVED',
      resourceType: 'plan_items',
      resourceId: itemId,
      oldValues: { planId: item.planId, plannedMonth: item.plannedMonth },
    });
    return { ok: true as const };
  }

  // ─────────────────────────── Ciclo de vida ───────────────────────────

  /**
   * Aprobar el plan hace DOS cosas irreversibles, y por eso pide confirmacion:
   *   1. CONGELA los proyectados de cada renglon (el denominador de la cobertura), y
   *   2. crea las obligaciones del plan (source = PLAN), que son las unicas que sus indicadores
   *      miran. Desde aqui, nada de lo que se asigne por fuera mueve estos numeros.
   */
  async approve(actor: AuthUser, id: string, input: ApprovePlanInput) {
    const tenantId = this.prisma.currentTenantId;
    const plan = await this.prisma.scoped.trainingPlan.findUnique({
      where: { id },
      include: { items: { include: { offering: { select: { id: true, code: true, status: true, projectedCount: true, regionalId: true, activityVersion: { select: { activityId: true, activity: { select: { name: true } } } } } } } } },
    });
    if (!plan) throw new NotFoundException({ code: 'PLAN_NOT_FOUND' });
    if (plan.status !== 'DRAFT') throw new ConflictException({ code: 'PLAN_ALREADY_APPROVED', status: plan.status });
    if (plan.items.length === 0) {
      throw new ConflictException({ code: 'PLAN_EMPTY', message: 'Un plan sin renglones no se aprueba.' });
    }

    const notPublished = plan.items.filter((item) => item.offering.status === 'DRAFT');
    if (notPublished.length > 0) {
      throw new ConflictException({
        code: 'PLAN_OFFERINGS_NOT_PUBLISHED',
        message: 'Publica las convocatorias del plan: sin publicarlas no hay proyectados que congelar.',
        offerings: notPublished.map((item) => item.offering.code),
      });
    }

    let createdAssignments = 0;
    const perUser = new Map<string, string[]>();

    for (const item of plan.items) {
      createdAssignments += await this.materialize(actor, tenantId, plan.year, item, perUser);
    }

    const approved = await this.prisma.scoped.trainingPlan.update({
      where: { id },
      data: { status: 'APPROVED', approvedBy: actor.id, approvedAt: new Date(), updatedBy: actor.id, version: { increment: 1 } },
    });

    await this.announce(tenantId, perUser, plan.year);
    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'PLAN_APPROVED',
      resourceType: 'training_plans',
      resourceId: id,
      oldValues: { status: 'DRAFT' },
      newValues: { status: 'APPROVED', assignments: createdAssignments, justification: input.justification ?? null },
    });
    return { plan: approved, assignments: createdAssignments };
  }

  /** APPROVED -> ACTIVE (en ejecucion) -> CLOSED (cerrado el ano). */
  async changeStatus(actor: AuthUser, id: string, next: 'ACTIVE' | 'CLOSED') {
    const plan = await this.requirePlan(id);
    const allowed = next === 'ACTIVE' ? plan.status === 'APPROVED' : plan.status === 'ACTIVE' || plan.status === 'APPROVED';
    if (!allowed) throw new ConflictException({ code: 'PLAN_TRANSITION_INVALID', from: plan.status, to: next });

    const updated = await this.prisma.scoped.trainingPlan.update({
      where: { id },
      data: { status: next, updatedBy: actor.id, version: { increment: 1 } },
    });
    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: next === 'ACTIVE' ? 'PLAN_ACTIVATED' : 'PLAN_CLOSED',
      resourceType: 'training_plans',
      resourceId: id,
      oldValues: { status: plan.status },
      newValues: { status: next },
    });
    return updated;
  }

  // ─────────────────────────── Apoyo ───────────────────────────

  /**
   * Hechos de cada renglon. La cobertura se cuenta EXCLUSIVAMENTE sobre las obligaciones del
   * propio renglon (source = PLAN, plan_item_id): es la implementacion literal de la regla de
   * oro 2, y por eso pasa por las asignaciones en vez de contar inscripciones de la convocatoria.
   */
  private async factsFor(
    items: Array<{ id: string; plannedMonth: number; status: PlanItemFacts['status']; projectedSnapshot: number | null }>,
  ): Promise<PlanItemFacts[]> {
    if (items.length === 0) return [];
    const itemIds = items.map((item) => item.id);

    const assignments = await this.prisma.scoped.assignment.findMany({
      where: { planItemId: { in: itemIds }, source: 'PLAN' },
      select: { id: true, planItemId: true },
    });
    const itemByAssignment = new Map(assignments.map((a) => [a.id, a.planItemId as string]));

    const enrollments = assignments.length
      ? await this.prisma.scoped.enrollment.findMany({
          where: { assignmentId: { in: assignments.map((a) => a.id) } },
          select: { assignmentId: true, status: true },
        })
      : [];

    const assigned = new Map<string, number>();
    const enrolled = new Map<string, number>();
    const trained = new Map<string, number>();
    for (const assignment of assignments) {
      const itemId = assignment.planItemId as string;
      assigned.set(itemId, (assigned.get(itemId) ?? 0) + 1);
    }
    const trainedStatuses = new Set(TRAINED_STATUSES.in as string[]);
    for (const enrollment of enrollments) {
      const itemId = itemByAssignment.get(enrollment.assignmentId as string);
      if (!itemId) continue;
      enrolled.set(itemId, (enrolled.get(itemId) ?? 0) + 1);
      if (trainedStatuses.has(enrollment.status)) {
        trained.set(itemId, (trained.get(itemId) ?? 0) + 1);
      }
    }

    return items.map((item) => ({
      itemId: item.id,
      plannedMonth: item.plannedMonth,
      status: item.status,
      projectedSnapshot: item.projectedSnapshot,
      assigned: assigned.get(item.id) ?? 0,
      enrolled: enrolled.get(item.id) ?? 0,
      trained: trained.get(item.id) ?? 0,
    }));
  }

  private groupByProcess(
    items: Array<{ id: string; offering: { activityVersion: { activity: { process: { id: string; code: string; name: string } } } } }>,
    factsById: Map<string, PlanItemFacts>,
  ) {
    const groups = new Map<string, { process: { id: string; code: string; name: string }; facts: PlanItemFacts[] }>();
    for (const item of items) {
      const process = item.offering.activityVersion.activity.process;
      const group = groups.get(process.id) ?? { process, facts: [] };
      const fact = factsById.get(item.id);
      if (fact) group.facts.push(fact);
      groups.set(process.id, group);
    }
    return [...groups.values()].map((group) => ({
      process: group.process,
      metrics: computePlanMetrics(group.facts),
    }));
  }

  private async announce(tenantId: string, perUser: Map<string, string[]>, year: number): Promise<void> {
    if (perUser.size === 0) return;
    const users = await this.prisma.scoped.user.findMany({
      where: { id: { in: [...perUser.keys()] } },
      select: { id: true, email: true },
    });
    for (const user of users) {
      const titles = perUser.get(user.id) ?? [];
      await this.notifications.notify(tenantId, {
        eventType: 'PLAN_ASSIGNMENTS_CREATED',
        recipientUserId: user.id,
        recipientEmail: user.email,
        subject: `Tu formacion del plan ${year}`,
        body: `El plan de capacitacion ${year} te incluye en: ${titles.slice(0, 5).join(', ')}${titles.length > 5 ? ` y ${titles.length - 5} mas` : ''}.`,
        referenceType: 'training_plans',
        referenceId: null,
      });
    }
  }

  /**
   * MATERIALIZAR un renglon: congela sus proyectados y crea las obligaciones de la gente.
   *
   * Es lo que hace de verdad "aprobar el plan", renglon a renglon, y vive aparte porque desde la
   * Decision #55 tambien lo necesita agregar una jornada a un plan YA aprobado: un renglon que
   * entra en agosto tiene que obligar igual que los que entraron en enero, o seria un adorno en
   * una pantalla que nadie cumple.
   *
   * Idempotente a proposito (mira que asignaciones ya existen antes de crear): aprobar dos veces,
   * o agregar y reintentar, no puede duplicar obligaciones —duplicar corrompe todo indicador de
   * cumplimiento, Decision #35—.
   */
  private async materialize(
    actor: AuthUser,
    tenantId: string,
    planYear: number,
    item: PlanItemToMaterialize,
    perUser: Map<string, string[]>,
  ): Promise<number> {
    if (item.status === 'CANCELLED') return 0;

    const people = await this.projected.resolve(item.offering.activityVersion.activityId, item.offering.regionalId);
    const dueAt = this.endOfMonth(planYear, item.plannedMonth);

    const existing = await this.prisma.scoped.assignment.findMany({
      where: { planItemId: item.id, userId: { in: people.userIds } },
      select: { userId: true },
    });
    const already = new Set(existing.map((row) => row.userId));
    const recipients = people.userIds.filter((userId) => !already.has(userId));

    await this.prisma.scoped.planItem.update({
      where: { id: item.id },
      data: { projectedSnapshot: item.offering.projectedCount ?? people.count },
    });

    if (recipients.length === 0) return 0;

    await this.prisma.scoped.assignment.createMany({
      data: recipients.map((userId) => ({
        tenantId,
        userId,
        targetType: 'ACTIVITY' as const,
        targetId: item.offering.activityVersion.activityId,
        source: 'PLAN' as const,
        planItemId: item.id,
        assignedBy: actor.id,
        cycleNumber: 1,
        dueAt,
        status: 'PENDING' as const,
      })),
    });
    for (const userId of recipients) {
      const titles = perUser.get(userId) ?? [];
      titles.push(item.offering.activityVersion.activity.name);
      perUser.set(userId, titles);
    }
    return recipients.length;
  }

  private async requirePlan(id: string) {
    const plan = await this.prisma.scoped.trainingPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException({ code: 'PLAN_NOT_FOUND' });
    return plan;
  }

  private assertEditable(status: string): void {
    if (status !== 'DRAFT') {
      throw new ConflictException({
        code: 'PLAN_NOT_EDITABLE',
        message: 'El plan aprobado no se edita: sus renglones ya obligan a personas.',
      });
    }
  }

  /** Vencimiento del renglon: el ultimo dia del mes programado, al cierre (hora de Colombia). */
  private endOfMonth(year: number, month: number): Date {
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return new Date(`${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59-05:00`);
  }
}
