import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AdjustProjectedInput,
  CancelOfferingInput,
  CreateOfferingInput,
  EnrollOfferingInput,
  ListOfferingsQuery,
  MigrateOfferingVersionInput,
  PublishOfferingInput,
  UpdateOfferingInput,
} from '@neo-pulse/shared';
import { assertScopeAllows, processScopeWhere, scopeAllows } from '../common/analyst-scope.js';
import { AuditService } from '../common/audit.service.js';
import { SequenceService } from '../common/sequence.service.js';
import type { AuthUser } from '../common/types.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectedAudienceService } from './projected-audience.service.js';
import { planVersionMigration, type MigrationPolicy } from './version-migration.js';

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
      status: true,
      activity: {
        select: {
          id: true,
          code: true,
          name: true,
          // Con esto el listado ya puede DECIR cuales quedaron colgadas de una version vieja,
          // sin una consulta por fila: la actividad apunta a su version vigente.
          currentVersionId: true,
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

  async list(actor: AuthUser, query: ListOfferingsQuery) {
    // Una sola clausula sobre la actividad: si se escribieran por separado, la ultima pisaria a
    // la anterior y filtrar por capacitacion anularia el alcance del analista.
    const activityWhere: Prisma.ActivityWhereInput = {
      ...(query.activityId ? { id: query.activityId } : {}),
      ...processScopeWhere(actor.scopeProcessIds, query.processId),
    };
    const where: Prisma.OfferingWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.regionalId ? { regionalId: query.regionalId } : {}),
      ...(Object.keys(activityWhere).length ? { activityVersion: { activity: activityWhere } } : {}),
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

  async getById(actor: AuthUser, id: string) {
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
                currentVersionId: true,
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
    // 404 y no 403, por lo mismo que en el catalogo: el id no se confirma a quien no le toca.
    if (!offering || !scopeAllows(actor.scopeProcessIds, offering.activityVersion.activity.process.id)) {
      throw new NotFoundException({ code: 'OFFERING_NOT_FOUND' });
    }

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

    return {
      ...offering,
      instructor,
      obligedCount: obliged,
      derivedProjected: derived,
      versionUpgrade: await this.versionUpgrade(offering.id),
    };
  }

  async create(actor: AuthUser, input: CreateOfferingInput) {
    const tenantId = this.prisma.currentTenantId;
    const version = await this.prisma.scoped.activityVersion.findUnique({
      where: { id: input.activityVersionId },
      select: { id: true, status: true, activity: { select: { id: true, name: true, processId: true } } },
    });
    if (!version) throw new NotFoundException({ code: 'ACTIVITY_VERSION_NOT_FOUND' });
    // La convocatoria hereda el proceso de su capacitacion: programar fuera del alcance es
    // programar en el plan de otro.
    assertScopeAllows(actor.scopeProcessIds, version.activity.processId);
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
    return this.getById(actor, offering.id);
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
    return this.getById(actor, id);
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

    // El renglon del plan se pone al dia con el numero que se acaba de congelar. Hace falta desde
    // la Decision #55: una jornada agregada a un plan vivo entra en borrador y su renglon guardo
    // el derivado del momento; sin esto, la ficha diria 52 y la cobertura seguiria dividiendo por
    // el numero viejo. Lo ejecutado y los planes cerrados no se tocan: eso ya es historia.
    await this.prisma.scoped.planItem.updateMany({
      where: { offeringId: id, status: { not: 'EXECUTED' }, plan: { status: { not: 'CLOSED' } } },
      data: { projectedSnapshot: projectedCount },
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
    return this.getById(actor, id);
  }

  /**
   * AJUSTAR los proyectados de una convocatoria publicada, con motivo (Decision #56).
   *
   * Toca DOS numeros a proposito. El de la convocatoria es el que se ve en su ficha; el del
   * renglon del plan (`projectedSnapshot`) es el que divide la cobertura. Corregir solo el primero
   * dejaria la pantalla diciendo 52 y el indicador siguiendo con 45, que es peor que no corregir
   * nada: el numero se ve arreglado y el informe sigue mal.
   *
   * No toca el renglon YA EJECUTADO ni el de un plan CERRADO: eso es historia, y la historia no se
   * reescribe (regla de oro 5).
   */
  async adjustProjected(actor: AuthUser, id: string, input: AdjustProjectedInput) {
    const tenantId = this.prisma.currentTenantId;
    const offering = await this.requireOffering(id);
    if (offering.status === 'DRAFT') {
      throw new ConflictException({
        code: 'OFFERING_NOT_PUBLISHED',
        message: 'Sin publicar no hay proyectados congelados: el numero se ajusta al publicar.',
      });
    }
    if (offering.status === 'CANCELLED') {
      throw new ConflictException({ code: 'OFFERING_CANCELLED', message: 'Esa convocatoria esta cancelada.' });
    }

    const before = offering.projectedCount;
    const touched = await this.prisma.tx(async (tx) => {
      await tx.offering.update({
        where: { id },
        data: {
          projectedCount: input.projectedCount,
          projectedAdjustReason: input.reason,
          updatedBy: actor.id,
          version: { increment: 1 },
        },
      });
      const result = await tx.planItem.updateMany({
        where: {
          offeringId: id,
          status: { not: 'EXECUTED' },
          plan: { status: { not: 'CLOSED' } },
        },
        data: { projectedSnapshot: input.projectedCount },
      });
      return result.count;
    });

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'OFFERING_PROJECTED_ADJUSTED',
      resourceType: 'offerings',
      resourceId: id,
      oldValues: { projectedCount: before },
      newValues: { projectedCount: input.projectedCount, reason: input.reason, planItemsUpdated: touched },
    });
    return this.getById(actor, id);
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
    return this.getById(actor, id);
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
    return this.getById(actor, id);
  }

  // ─────────────────────── Version vigente ───────────────────────

  /**
   * QUE PASARIA si esta convocatoria se apuntara a la version vigente. Se responde ANTES de
   * ofrecer el boton, y por eso existe como consulta propia: mover a gente ya citada de version
   * no es un cambio de formulario, y quien lo autoriza tiene derecho a ver a cuantos afecta.
   *
   * `available: false` NO es un error: es una convocatoria que ya esta al dia, o cerrada, o de
   * una actividad sin version publicada. La pantalla dice cual de las tres, en vez de mostrar un
   * boton que dara error (misma regla que la tarjeta de pendientes del aprendiz).
   */
  async versionUpgrade(id: string) {
    const offering = await this.requireOffering(id);
    const current = await this.prisma.scoped.activityVersion.findUnique({
      where: { id: offering.activityVersionId },
      select: {
        id: true,
        versionNumber: true,
        status: true,
        activityId: true,
        activity: { select: { name: true, currentVersionId: true } },
      },
    });
    if (!current) throw new NotFoundException({ code: 'ACTIVITY_VERSION_NOT_FOUND' });

    const base = {
      current: { id: current.id, versionNumber: current.versionNumber, status: current.status },
      target: null,
      enrollments: null,
    };

    const targetId = current.activity.currentVersionId;
    if (!targetId || targetId === current.id) {
      return { ...base, available: false, reason: 'UP_TO_DATE' as const };
    }
    if (offering.status === 'COMPLETED' || offering.status === 'CANCELLED') {
      // Una jornada ya ejecutada es historia: cambiarle el contenido reescribiria lo que paso.
      return { ...base, available: false, reason: 'OFFERING_CLOSED' as const };
    }

    const target = await this.prisma.scoped.activityVersion.findUnique({
      where: { id: targetId },
      select: { id: true, versionNumber: true, status: true, activityId: true, publishedAt: true, migrationPolicy: true },
    });
    if (!target || target.status !== 'PUBLISHED' || target.activityId !== current.activityId) {
      return { ...base, available: false, reason: 'NO_PUBLISHED_TARGET' as const };
    }

    const plan = await this.planMigration(id, target.id, target.migrationPolicy);
    return {
      available: true,
      reason: null,
      current: base.current,
      target: {
        id: target.id,
        versionNumber: target.versionNumber,
        publishedAt: target.publishedAt,
        migrationPolicy: target.migrationPolicy,
      },
      enrollments: plan.counts,
    };
  }

  /**
   * APUNTAR LA CONVOCATORIA A LA VERSION VIGENTE.
   *
   * Hasta aqui, publicar una v2 dejaba la convocatoria colgada de la v1 retirada: el
   * administrador creia haber actualizado la formacion y el aprendiz seguia viendo la anterior,
   * sin nada en pantalla que lo explicara. La politica de migracion se guardaba al publicar y no
   * la leia nadie; esto es lo que la hace valer.
   *
   * Lo que NO hace, a proposito: no toca una sola ejecucion cerrada, y no borra el avance del que
   * se mueve. El avance viejo queda en la base apuntando a los contenidos de la version vieja:
   * como el calculo de completitud se hace contra los contenidos de la version DE LA EJECUCION,
   * ese avance deja de contar solo, y sigue estando para quien tenga que auditar que ocurrio.
   */
  async migrateVersion(actor: AuthUser, id: string, input: MigrateOfferingVersionInput) {
    const tenantId = this.prisma.currentTenantId;
    const offering = await this.requireOffering(id);
    if (offering.status === 'COMPLETED' || offering.status === 'CANCELLED') {
      throw new ConflictException({
        code: 'OFFERING_CLOSED',
        message: 'Una convocatoria ejecutada o cancelada ya es historia: no se le cambia el contenido.',
        status: offering.status,
      });
    }
    if (offering.activityVersionId === input.targetVersionId) {
      throw new ConflictException({ code: 'ALREADY_ON_VERSION' });
    }

    const [current, target] = await Promise.all([
      this.prisma.scoped.activityVersion.findUnique({
        where: { id: offering.activityVersionId },
        select: { id: true, versionNumber: true, activityId: true },
      }),
      this.prisma.scoped.activityVersion.findUnique({
        where: { id: input.targetVersionId },
        select: {
          id: true,
          versionNumber: true,
          status: true,
          activityId: true,
          passingScore: true,
          migrationPolicy: true,
          activity: { select: { name: true, currentVersionId: true } },
        },
      }),
    ]);
    if (!current || !target) throw new NotFoundException({ code: 'ACTIVITY_VERSION_NOT_FOUND' });
    if (target.activityId !== current.activityId) {
      throw new ConflictException({ code: 'VERSION_OTHER_ACTIVITY' });
    }
    if (target.status !== 'PUBLISHED') {
      throw new ConflictException({
        code: 'VERSION_NOT_PUBLISHED',
        message: 'Solo se convoca contenido publicado.',
      });
    }
    // La version destino viaja explicita justamente para esto: si alguien publico otra mientras
    // la pantalla estaba abierta, se para aqui en vez de mover a una version que nadie reviso.
    if (target.activity.currentVersionId !== target.id) {
      throw new ConflictException({
        code: 'VERSION_SUPERSEDED',
        message: 'Se publico otra version mientras decidias. Vuelve a revisar antes de mover a la gente.',
      });
    }

    const plan = await this.planMigration(id, target.id, target.migrationPolicy);
    const restart = target.migrationPolicy === 'RESTART_NEW';

    await this.prisma.tx(async (tx) => {
      await tx.offering.update({
        where: { id },
        data: { activityVersionId: target.id, updatedBy: actor.id, version: { increment: 1 } },
      });

      for (const enrollment of plan.moving) {
        const snapshot = (enrollment.scoreSnapshot ?? {}) as Record<string, unknown>;
        await tx.enrollment.update({
          where: { id: enrollment.id },
          data: {
            activityVersionId: target.id,
            // El cargo, el area y la vinculacion son la foto de la PERSONA al inscribirse y no se
            // tocan (Decision #33); lo que cambia es que formacion esta cursando.
            scoreSnapshot: {
              ...snapshot,
              activityName: target.activity.name,
              versionNumber: target.versionNumber,
              passingScore: target.passingScore,
              migratedFromVersionNumber: current.versionNumber,
              migratedAt: new Date().toISOString(),
            } as Prisma.InputJsonValue,
            ...(restart ? { status: 'ENROLLED' as const, startedAt: null } : {}),
          },
        });
      }
    });

    for (const person of plan.notify) {
      await this.notifications.notify(tenantId, {
        eventType: 'ENROLLED',
        recipientUserId: person.id,
        recipientEmail: person.email,
        subject: 'Actualizamos tu formacion',
        body: `${target.activity.name} (${offering.code}) paso a la version ${target.versionNumber}.${
          restart ? ' Se vuelve a empezar desde el principio.' : ''
        }`,
        referenceType: 'offerings',
        referenceId: id,
      });
    }

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'OFFERING_VERSION_MIGRATED',
      resourceType: 'offerings',
      resourceId: id,
      oldValues: { activityVersionId: current.id, versionNumber: current.versionNumber },
      newValues: {
        activityVersionId: target.id,
        versionNumber: target.versionNumber,
        migrationPolicy: target.migrationPolicy,
        ...plan.counts,
        justification: input.justification ?? null,
      },
    });
    return this.getById(actor, id);
  }

  /**
   * Reune los hechos y deja decidir a `planVersionMigration` (funcion pura y probada): a quien
   * mueve y a quien no es LA regla de esta operacion, y tiene que poder leerse sin Prisma delante.
   */
  private async planMigration(
    offeringId: string,
    targetVersionId: string,
    policy: MigrationPolicy,
  ) {
    const enrollments = await this.prisma.scoped.enrollment.findMany({
      where: { offeringId },
      select: {
        id: true,
        userId: true,
        status: true,
        activityVersionId: true,
        scoreSnapshot: true,
        user: { select: { id: true, email: true } },
      },
    });

    // Los dos hechos que la regla necesita y que solo la base sabe: quien ya abrio la formacion,
    // y quien ya tiene otra ejecucion abierta de la version destino. Se preguntan una vez, para
    // todos, y luego decide la funcion pura.
    const ids = enrollments.map((e) => e.id);
    const userIds = enrollments.map((e) => e.userId);
    const [touched, attempted, collisions] = ids.length
      ? await Promise.all([
          this.prisma.scoped.activityProgress.findMany({
            where: { enrollmentId: { in: ids } },
            select: { enrollmentId: true },
            distinct: ['enrollmentId'],
          }),
          this.prisma.scoped.attempt.findMany({
            where: { enrollmentId: { in: ids } },
            select: { enrollmentId: true },
            distinct: ['enrollmentId'],
          }),
          this.prisma.scoped.enrollment.findMany({
            where: { userId: { in: userIds }, activityVersionId: targetVersionId, offeringId: { not: offeringId } },
            select: { userId: true },
          }),
        ])
      : [[], [], []];

    const started = new Set([...touched.map((row) => row.enrollmentId), ...attempted.map((row) => row.enrollmentId)]);
    const conflicted = new Set(collisions.map((row) => row.userId));

    const plan = planVersionMigration(
      enrollments.map((e) => ({
        ...e,
        started: started.has(e.id),
        hasOtherEnrollmentOnTarget: conflicted.has(e.userId),
      })),
      targetVersionId,
      policy,
    );
    return { ...plan, notify: plan.moving.map((e) => e.user) };
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
