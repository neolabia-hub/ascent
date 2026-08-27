import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CancelOfferingInput,
  CreateOfferingInput,
  EnrollOfferingInput,
  ListOfferingsQuery,
  PublishOfferingInput,
  UpdateOfferingInput,
} from '@neo-pulse/shared';
import { AuditService } from '../common/audit.service.js';
import { SequenceService } from '../common/sequence.service.js';
import type { AuthUser } from '../common/types.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectedAudienceService } from './projected-audience.service.js';

const OFFERING_LIST_SELECT = {
  id: true,
  code: true,
  kind: true,
  modality: true,
  status: true,
  scheduledDate: true,
  startTime: true,
  endTime: true,
  windowStart: true,
  windowEnd: true,
  location: true,
  projectedCount: true,
  projectedFrozenAt: true,
  regional: { select: { id: true, name: true } },
  activityVersion: {
    select: {
      id: true,
      versionNumber: true,
      activity: {
        select: {
          id: true,
          code: true,
          name: true,
          activityType: { select: { code: true, name: true, colorHex: true } },
          process: { select: { id: true, code: true, name: true } },
        },
      },
    },
  },
  _count: { select: { enrollments: true } },
} satisfies Prisma.OfferingSelect;

/** Estados en los que la convocatoria admite cambios de contenido. */
const EDITABLE_STATUSES = ['DRAFT'] as const;

/**
 * CONVOCATORIA: cuando, donde, con quien (CLAUDE.md 3.7). Cuelga SIEMPRE de una version
 * PUBLICADA, porque convocar un borrador seria prometer un contenido que aun puede cambiar.
 */
@Injectable()
export class OfferingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequences: SequenceService,
    private readonly projected: ProjectedAudienceService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(query: ListOfferingsQuery) {
    const where: Prisma.OfferingWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.regionalId ? { regionalId: query.regionalId } : {}),
      ...(query.activityId ? { activityVersion: { activityId: query.activityId } } : {}),
      ...(query.processId ? { activityVersion: { activity: { processId: query.processId } } } : {}),
      ...(query.q
        ? {
            OR: [
              { code: { contains: query.q.toUpperCase() } },
              { activityVersion: { activity: { name: { contains: query.q, mode: 'insensitive' } } } },
              { location: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...this.dateRange(query.year, query.month),
    };

    const [total, items] = await Promise.all([
      this.prisma.scoped.offering.count({ where }),
      this.prisma.scoped.offering.findMany({
        where,
        select: OFFERING_LIST_SELECT,
        orderBy: [{ scheduledDate: 'desc' }, { code: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { total, page: query.page, pageSize: query.pageSize, items };
  }

  async getById(id: string) {
    const offering = await this.prisma.scoped.offering.findUnique({
      where: { id },
      include: {
        regional: { select: { id: true, name: true } },
        activityVersion: {
          select: {
            id: true,
            versionNumber: true,
            status: true,
            passingScore: true,
            estimatedMinutes: true,
            activity: {
              select: {
                id: true,
                code: true,
                name: true,
                description: true,
                activityType: { select: { code: true, name: true, colorHex: true } },
                process: { select: { id: true, code: true, name: true } },
              },
            },
          },
        },
        planItems: { select: { id: true, plannedMonth: true, status: true, plan: { select: { id: true, name: true, year: true, status: true } } } },
        _count: { select: { enrollments: true } },
      },
    });
    if (!offering) throw new NotFoundException({ code: 'OFFERING_NOT_FOUND' });

    const [instructor, obliged, derived] = await Promise.all([
      offering.instructorUserId
        ? this.prisma.scoped.user.findUnique({
            where: { id: offering.instructorUserId },
            select: { id: true, fullName: true, email: true, jobTitle: { select: { name: true } } },
          })
        : Promise.resolve(null),
      this.prisma.scoped.assignment.count({
        where: {
          targetType: 'ACTIVITY',
          targetId: offering.activityVersion.activity.id,
          status: { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE'] },
        },
      }),
      // Los proyectados congelados NO se recalculan; se muestra el derivado de hoy solo como
      // referencia para quien decide si vale la pena ajustar con justificacion.
      this.projected.derive(offering.activityVersion.activity.id, offering.regionalId),
    ]);

    return { ...offering, instructor, obligedCount: obliged, derivedProjected: derived };
  }

  async create(actor: AuthUser, input: CreateOfferingInput) {
    const tenantId = this.prisma.currentTenantId;
    const version = await this.prisma.scoped.activityVersion.findUnique({
      where: { id: input.activityVersionId },
      select: { id: true, status: true, activity: { select: { id: true, name: true } } },
    });
    if (!version) throw new NotFoundException({ code: 'ACTIVITY_VERSION_NOT_FOUND' });
    if (version.status !== 'PUBLISHED') {
      throw new ConflictException({
        code: 'VERSION_NOT_PUBLISHED',
        message: 'Solo se convoca contenido publicado: publica la version antes de programarla.',
      });
    }

    const year = input.scheduledDate ? Number(input.scheduledDate.slice(0, 4)) : new Date().getFullYear();
    const offering = await this.prisma.tx(async (tx) => {
      const value = await this.sequences.next(tx, tenantId, 'OFFERING', year);
      return tx.offering.create({
        data: {
          tenantId,
          activityVersionId: input.activityVersionId,
          code: this.sequences.format('CONV', year, value),
          ...this.writableFields(input),
          createdBy: actor.id,
          updatedBy: actor.id,
        },
      });
    });

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'OFFERING_CREATED',
      resourceType: 'offerings',
      resourceId: offering.id,
      newValues: { code: offering.code, activity: version.activity.name, kind: input.kind },
    });
    return this.getById(offering.id);
  }

  async update(actor: AuthUser, id: string, input: UpdateOfferingInput) {
    const before = await this.requireOffering(id);
    if (!EDITABLE_STATUSES.includes(before.status as (typeof EDITABLE_STATUSES)[number])) {
      throw new ConflictException({
        code: 'OFFERING_NOT_EDITABLE',
        message: 'Una convocatoria publicada no se edita: cancelala y programa otra.',
      });
    }

    await this.prisma.scoped.offering.update({
      where: { id },
      data: { ...this.writableFields(input), updatedBy: actor.id, version: { increment: 1 } },
    });
    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: 'OFFERING_UPDATED',
      resourceType: 'offerings',
      resourceId: id,
      oldValues: { scheduledDate: before.scheduledDate, location: before.location, kind: before.kind },
      newValues: input,
    });
    return this.getById(id);
  }

  /** Cuantas personas proyectaria hoy esta convocatoria (antes de publicarla). */
  async previewProjected(id: string) {
    const offering = await this.requireOffering(id);
    const version = await this.prisma.scoped.activityVersion.findUnique({
      where: { id: offering.activityVersionId },
      select: { activityId: true },
    });
    if (!version) throw new NotFoundException({ code: 'ACTIVITY_VERSION_NOT_FOUND' });
    return this.projected.derive(version.activityId, offering.regionalId);
  }

  /**
   * Publicar CONGELA los proyectados y abre la convocatoria. A partir de aqui la cobertura
   * tiene denominador fijo: editar despues los requisitos no reescribe el indicador de esta
   * jornada (Decision #5).
   */
  async publish(actor: AuthUser, id: string, input: PublishOfferingInput) {
    const tenantId = this.prisma.currentTenantId;
    const offering = await this.requireOffering(id);
    if (offering.status !== 'DRAFT') {
      throw new ConflictException({ code: 'OFFERING_ALREADY_PUBLISHED', status: offering.status });
    }

    const version = await this.prisma.scoped.activityVersion.findUnique({
      where: { id: offering.activityVersionId },
      select: { activityId: true, status: true, activity: { select: { name: true } } },
    });
    if (!version || version.status !== 'PUBLISHED') {
      throw new ConflictException({ code: 'VERSION_NOT_PUBLISHED' });
    }

    const derived = await this.projected.derive(version.activityId, offering.regionalId);
    const projectedCount = input.projectedOverride ?? derived.count;

    const published = await this.prisma.scoped.offering.update({
      where: { id },
      data: {
        status: 'PUBLISHED',
        projectedCount,
        projectedFrozenAt: new Date(),
        projectedAdjustReason: input.projectedAdjustReason ?? null,
        updatedBy: actor.id,
        version: { increment: 1 },
      },
    });

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'OFFERING_PUBLISHED',
      resourceType: 'offerings',
      resourceId: id,
      oldValues: { status: 'DRAFT' },
      newValues: {
        status: 'PUBLISHED',
        projectedCount,
        derivedCount: derived.count,
        derivedSource: derived.source,
        projectedAdjustReason: input.projectedAdjustReason ?? null,
      },
    });

    if (offering.instructorUserId) {
      const instructor = await this.prisma.scoped.user.findUnique({
        where: { id: offering.instructorUserId },
        select: { id: true, email: true },
      });
      if (instructor) {
        await this.notifications.notify(tenantId, {
          eventType: 'OFFERING_PUBLISHED',
          recipientUserId: instructor.id,
          recipientEmail: instructor.email,
          subject: 'Te asignaron una convocatoria',
          body: `Vas a dictar ${version.activity.name} (${published.code}).`,
          referenceType: 'offerings',
          referenceId: id,
        });
      }
    }
    return this.getById(id);
  }

  async cancel(actor: AuthUser, id: string, input: CancelOfferingInput) {
    const offering = await this.requireOffering(id);
    if (offering.status === 'CANCELLED' || offering.status === 'COMPLETED') {
      throw new ConflictException({ code: 'OFFERING_NOT_CANCELLABLE', status: offering.status });
    }

    await this.prisma.tx(async (tx) => {
      await tx.offering.update({
        where: { id },
        data: { status: 'CANCELLED', cancelledReason: input.cancelledReason, updatedBy: actor.id },
      });
      // El renglon del plan refleja la realidad: una convocatoria cancelada no queda "planeada".
      await tx.planItem.updateMany({ where: { offeringId: id, status: 'PLANNED' }, data: { status: 'CANCELLED' } });
    });

    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: 'OFFERING_CANCELLED',
      resourceType: 'offerings',
      resourceId: id,
      oldValues: { status: offering.status },
      newValues: { status: 'CANCELLED', cancelledReason: input.cancelledReason },
    });
    return this.getById(id);
  }

  /** Cerrar la convocatoria: es lo que la vuelve "ejecutada" en el plan anual. */
  async complete(actor: AuthUser, id: string) {
    const offering = await this.requireOffering(id);
    if (offering.status !== 'PUBLISHED' && offering.status !== 'IN_PROGRESS') {
      throw new ConflictException({ code: 'OFFERING_NOT_COMPLETABLE', status: offering.status });
    }

    await this.prisma.tx(async (tx) => {
      await tx.offering.update({ where: { id }, data: { status: 'COMPLETED', updatedBy: actor.id } });
      await tx.planItem.updateMany({
        where: { offeringId: id, status: { in: ['PLANNED', 'RESCHEDULED'] } },
        data: { status: 'EXECUTED' },
      });
    });

    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: 'OFFERING_COMPLETED',
      resourceType: 'offerings',
      resourceId: id,
      oldValues: { status: offering.status },
      newValues: { status: 'COMPLETED' },
    });
    return this.getById(id);
  }

  // ─────────────────────────── Inscritos ───────────────────────────

  async roster(id: string) {
    await this.requireOffering(id);
    const enrollments = await this.prisma.scoped.enrollment.findMany({
      where: { offeringId: id },
      orderBy: { enrolledAt: 'asc' },
      select: {
        id: true,
        status: true,
        enrolledAt: true,
        startedAt: true,
        completedAt: true,
        finalScore: true,
        assignmentId: true,
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
    });
    return { total: enrollments.length, items: enrollments };
  }

  /**
   * Inscribir = crear la EJECUCION. La inscripcion nace ENLAZADA a la obligacion que va a
   * satisfacer (Decision #2) y con el cargo, area y vinculacion de la persona congelados
   * (Decision #33): dentro de dos anos el certificado debe decir el cargo que tenia ese dia.
   */
  async enroll(actor: AuthUser, id: string, input: EnrollOfferingInput) {
    const tenantId = this.prisma.currentTenantId;
    const offering = await this.requireOffering(id);
    if (offering.status !== 'PUBLISHED' && offering.status !== 'IN_PROGRESS') {
      throw new ConflictException({
        code: 'OFFERING_NOT_OPEN',
        message: 'Publica la convocatoria antes de inscribir personas.',
      });
    }

    const version = await this.prisma.scoped.activityVersion.findUnique({
      where: { id: offering.activityVersionId },
      select: {
        activityId: true,
        versionNumber: true,
        passingScore: true,
        syllabusSnapshot: true,
        activity: { select: { name: true } },
      },
    });
    if (!version) throw new NotFoundException({ code: 'ACTIVITY_VERSION_NOT_FOUND' });

    const openAssignments = await this.prisma.scoped.assignment.findMany({
      where: {
        targetType: 'ACTIVITY',
        targetId: version.activityId,
        status: { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE'] },
        // "Todos los obligados" significa los que ESTA convocatoria atiende: si es de una
        // regional, no arrastra a la empresa entera a una jornada de otra ciudad. Es el mismo
        // alcance con el que se derivan los proyectados, para que numerador y denominador
        // hablen de la misma gente.
        ...(offering.regionalId && input.allAssigned ? { user: { regionalId: offering.regionalId } } : {}),
        ...(input.allAssigned ? {} : { userId: { in: input.userIds } }),
      },
      select: { id: true, userId: true },
    });
    const assignmentByUser = new Map(openAssignments.map((a) => [a.userId, a.id]));

    const userIds = input.allAssigned ? [...assignmentByUser.keys()] : input.userIds;
    if (userIds.length === 0) return { enrolled: 0, skipped: 0 };

    const [people, already] = await Promise.all([
      this.prisma.scoped.user.findMany({
        where: { id: { in: userIds }, active: true, deletedAt: null },
        select: {
          id: true,
          fullName: true,
          email: true,
          employmentType: true,
          jobTitle: { select: { name: true } },
          area: { select: { name: true } },
        },
      }),
      this.prisma.scoped.enrollment.findMany({ where: { offeringId: id }, select: { userId: true } }),
    ]);
    const enrolledAlready = new Set(already.map((e) => e.userId));
    const toEnroll = people.filter((person) => !enrolledAlready.has(person.id));

    if (offering.capacity !== null && enrolledAlready.size + toEnroll.length > offering.capacity) {
      throw new ConflictException({
        code: 'OFFERING_CAPACITY_EXCEEDED',
        message: `El cupo es de ${offering.capacity} personas.`,
      });
    }

    if (toEnroll.length > 0) {
      await this.prisma.scoped.enrollment.createMany({
        data: toEnroll.map((person) => ({
          tenantId,
          offeringId: id,
          userId: person.id,
          activityVersionId: offering.activityVersionId,
          assignmentId: assignmentByUser.get(person.id) ?? null,
          status: 'ENROLLED' as const,
          scoreSnapshot: {
            activityName: version.activity.name,
            versionNumber: version.versionNumber,
            passingScore: version.passingScore,
            jobTitle: person.jobTitle.name,
            area: person.area.name,
            employmentType: person.employmentType,
          } as Prisma.InputJsonValue,
        })),
      });
    }

    for (const person of toEnroll) {
      await this.notifications.notify(tenantId, {
        eventType: 'ENROLLED',
        recipientUserId: person.id,
        recipientEmail: person.email,
        subject: 'Quedaste inscrito en una formacion',
        body: `${version.activity.name} (${offering.code}).`,
        referenceType: 'offerings',
        referenceId: id,
      });
    }

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'OFFERING_ENROLLED',
      resourceType: 'offerings',
      resourceId: id,
      newValues: { enrolled: toEnroll.length, skipped: people.length - toEnroll.length },
    });
    return { enrolled: toEnroll.length, skipped: people.length - toEnroll.length };
  }

  // ─────────────────────────── Apoyo ───────────────────────────

  private async requireOffering(id: string) {
    const offering = await this.prisma.scoped.offering.findUnique({ where: { id } });
    if (!offering) throw new NotFoundException({ code: 'OFFERING_NOT_FOUND' });
    return offering;
  }

  /** Campos que el usuario controla, normalizados (fechas civiles en hora de Colombia). */
  private writableFields(input: CreateOfferingInput | UpdateOfferingInput) {
    return {
      kind: input.kind,
      modality: input.modality,
      scheduledDate: this.toDate(input.scheduledDate),
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      windowStart: this.toDate(input.windowStart),
      windowEnd: this.toDate(input.windowEnd),
      intensityTheoryHours: input.intensityTheoryHours ?? null,
      intensityPracticeHours: input.intensityPracticeHours ?? null,
      instructorUserId: input.instructorUserId ?? null,
      instructorExternalName: input.instructorExternalName ?? null,
      instructorCredentialKey: input.instructorCredentialKey ?? null,
      executedBy: input.executedBy,
      executedByOther: input.executedByOther ?? null,
      location: input.location ?? null,
      regionalId: input.regionalId ?? null,
      capacity: input.capacity ?? null,
      observations: input.observations ?? null,
    };
  }

  private toDate(value: string | null | undefined): Date | null {
    return value ? new Date(`${value}T00:00:00-05:00`) : null;
  }

  private dateRange(year?: number, month?: number): Prisma.OfferingWhereInput {
    if (!year) return {};
    const from = month ? new Date(Date.UTC(year, month - 1, 1)) : new Date(Date.UTC(year, 0, 1));
    const to = month ? new Date(Date.UTC(year, month, 1)) : new Date(Date.UTC(year + 1, 0, 1));
    return { scheduledDate: { gte: from, lt: to } };
  }
}
