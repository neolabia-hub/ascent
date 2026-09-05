import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Modality } from '@prisma/client';
import type {
  AudienceRule,
  AdjustProjectedInput,
  CancelOfferingInput,
  CreateOfferingInput,
  EnrollOfferingInput,
  ListOfferingsQuery,
  MarcarAsistenciaInput,
  MigrateOfferingVersionInput,
  PreviewProjectedInput,
  PublishOfferingInput,
  UpdateOfferingInput,
} from '@neo-pulse/shared';
import { assertScopeAllows, processScopeWhere, scopeAllows } from '../common/analyst-scope.js';
import { renglonAutomatico } from './plan-auto-item.js';
import { AuditService } from '../common/audit.service.js';
import { SequenceService } from '../common/sequence.service.js';
import type { AuthUser } from '../common/types.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ruleReachesEveryone } from '../assignments/audience-rule.js';
import { AudiencesService } from '../assignments/audiences.service.js';
import { CompletionService } from '../learning/completion.service.js';
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
          activityType: { select: { code: true, name: true, colorHex: true, config: true } },
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
    // La TAJADA de la jornada se declara con los mismos criterios que Quienes, asi que la
    // audiencia la resuelve la misma pieza: dos implementaciones crearian grupos gemelos.
    private readonly audiences: AudiencesService,
    // Cerrar por ASISTENCIA usa la MISMA pieza que cierra por contenido (Decision #157): dos
    // caminos para dar por cumplida una obligacion acabarian cerrandola de dos formas distintas.
    private readonly completion: CompletionService,
  ) {}

  /**
   * MARCAR LA ASISTENCIA DE UNA JORNADA (Decision #157).
   *
   * ─── LA ASISTENCIA VA CON EL `kind`, NO CON LA MODALIDAD ───
   *
   * Es la pregunta que parece obvia y no lo es. Una jornada `EVENT` —tiene fecha, cupo y alguien
   * que convoca— se cierra por asistencia LA DICTE COMO LA DICTE: presencial en un salon o virtual
   * en vivo por videollamada. En las dos hay una lista de quien estuvo y en ninguna queda contenido
   * completado en la plataforma. Una `PERMANENT` no: ahi la persona entra sola cuando puede y la
   * evidencia es justamente lo que la plataforma registro. Atarlo a `PRESENCIAL` dejaria fuera el
   * webinar de la ARL, que es cada vez mas comun.
   *
   * ─── `attended: false` ES UN DATO, NO UN HUECO ───
   *
   * "Convocado y NO vino" es exactamente lo que hay que poder demostrar, y es distinto de "todavia
   * no lo hemos revisado". Por eso se manda la lista entera y no solo los presentes.
   */
  async marcarAsistencia(actor: AuthUser, offeringId: string, input: MarcarAsistenciaInput) {
    const offering = await this.requireOffering(offeringId);
    if (offering.kind === 'PERMANENT') {
      throw new ConflictException({
        code: 'OFFERING_NOT_ATTENDABLE',
        message:
          'Esta convocatoria es de autoservicio: se acredita completando el contenido, no con una lista de asistencia.',
      });
    }
    if (offering.status === 'DRAFT' || offering.status === 'CANCELLED') {
      throw new ConflictException({ code: 'OFFERING_NOT_ATTENDABLE', status: offering.status });
    }

    const tenantId = this.prisma.currentTenantId;
    const conCertificado = input.items.filter((fila) => fila.certificate);
    if (conCertificado.length > 0 && !(await this.tipoRegistraCertificadoExterno(offeringId))) {
      /*
        LA COMPUERTA VIVE EN EL SERVIDOR, no solo en la pantalla.

        Que una clase de formacion se acredite con el papel de un tercero lo decide la empresa en
        `activity_types.config.tracksExternalCertificate` —una recertificacion si, una charla de
        quince minutos no—. Un control que solo existe en el navegador no es un control.
      */
      throw new ConflictException({
        code: 'TYPE_DOES_NOT_TRACK_EXTERNAL_CERT',
        message:
          'Este tipo de formacion no lleva certificado de un tercero. Se cambia en Configuracion → Tipos de formacion.',
      });
    }

    // Solo las inscripciones de ESTA jornada: mandar el id de otra cerraria la formacion de alguien
    // que no estuvo aqui.
    const validas = new Set(
      (
        await this.prisma.scoped.enrollment.findMany({
          where: { offeringId, id: { in: input.items.map((fila) => fila.enrollmentId) } },
          select: { id: true },
        })
      ).map((fila) => fila.id),
    );

    const heldOn = input.heldOn ? new Date(`${input.heldOn}T12:00:00-05:00`) : new Date();
    let cerradas = 0;
    let ausentes = 0;
    const ignoradas: string[] = [];

    for (const fila of input.items) {
      if (!validas.has(fila.enrollmentId)) {
        ignoradas.push(fila.enrollmentId);
        continue;
      }
      if (!fila.attended) {
        // NO se cierra nada y NO se retira la obligacion: quien no vino la SIGUE debiendo, que es
        // el punto entero de tomar asistencia. Queda escrito que se le convoco y no asistio.
        await this.prisma.scoped.enrollment.update({
          where: { id: fila.enrollmentId },
          data: { attendedAt: null, attendanceBy: actor.id },
        });
        ausentes += 1;
        continue;
      }
      const resultado = await this.completion.cerrarPorAsistencia(this.prisma.scoped, tenantId, {
        enrollmentId: fila.enrollmentId,
        attendedAt: heldOn,
        attendanceBy: actor.id,
        certificado: fila.certificate
          ? {
              issuer: fila.certificate.issuer,
              number: fila.certificate.number,
              issuedAt: fila.certificate.issuedAt ? new Date(`${fila.certificate.issuedAt}T12:00:00-05:00`) : null,
              // FIN DEL DIA en Bogota, como todo vencimiento del sistema: "vence el 31" quiere decir
              // que a las once de la noche del 31 todavia acredita.
              validUntil: fila.certificate.validUntil
                ? new Date(`${fila.certificate.validUntil}T23:59:59-05:00`)
                : null,
              fileKey: fila.certificate.fileKey ?? null,
            }
          : null,
      });
      if (resultado.closed) cerradas += 1;
    }

    if (input.attendanceSheetKey) {
      await this.prisma.scoped.offering.update({
        where: { id: offeringId },
        data: { attendanceSheetKey: input.attendanceSheetKey },
      });
    }

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'OFFERING_ATTENDANCE_MARKED',
      resourceType: 'offerings',
      resourceId: offeringId,
      newValues: {
        heldOn: heldOn.toISOString(),
        revisadas: input.items.length,
        cerradas,
        ausentes,
        conCertificadoExterno: conCertificado.length,
        acta: Boolean(input.attendanceSheetKey),
      },
    });

    return { revisadas: input.items.length, cerradas, ausentes, ignoradas };
  }

  /**
   * ¿ESTA CLASE DE FORMACION SE ACREDITA CON EL PAPEL DE UN TERCERO?
   *
   * Lo decide la empresa en el TIPO, no el codigo: una recertificacion de montacargas si, una
   * capacitacion del plan normalmente no, y otro cliente puede pensarlo distinto. Vive donde ya
   * viven todas las decisiones por clase de formacion (`activity_types.config`) y se cambia desde
   * Configuracion → Tipos de formacion, igual que la fecha de campana o la gracia por ingreso
   * reciente.
   */
  private async tipoRegistraCertificadoExterno(offeringId: string): Promise<boolean> {
    const fila = await this.prisma.scoped.offering.findUnique({
      where: { id: offeringId },
      select: {
        activityVersion: {
          select: { activity: { select: { activityType: { select: { config: true } } } } },
        },
      },
    });
    const config = fila?.activityVersion.activity.activityType?.config;
    if (!config || typeof config !== 'object') return false;
    return (config as Record<string, unknown>).tracksExternalCertificate === true;
  }

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
        // NULLS LAST explicito, y no el orden que regala Postgres: en DESC las fechas nulas van
        // PRIMERAS, asi que las convocatorias sin fecha (borradores, cursos permanentes) se
        // quedaban con la primera pagina entera. Con 52 sin fecha y un tope de 100, una
        // convocatoria recien publicada CAIA FUERA de la lista y el plan no podia engancharla:
        // el sintoma era otra vez "no aparece", y la causa estaba a dos capas de distancia.
        orderBy: [{ scheduledDate: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }, { code: 'desc' }],
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
        // La TAJADA, con su regla, para que la pantalla pueda ABRIRSE con lo que hay puesto en
        // vez de en blanco y no haya que volver a marcarlo todo para corregir un detalle.
        audience: { select: { id: true, name: true, rule: true } },
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
                activityType: { select: { code: true, name: true, colorHex: true, config: true } },
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
      this.projected.derive(offering.activityVersion.activity.id, { audienceId: offering.audienceId, regionalId: offering.regionalId }),
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
      select: {
        id: true,
        status: true,
        activity: {
          select: {
            id: true,
            name: true,
            processId: true,
            // Para saber si esta jornada tiene que entrar sola al plan (Decision #75).
            activityType: { select: { config: true } },
          },
        },
      },
    });
    if (!version) throw new NotFoundException({ code: 'ACTIVITY_VERSION_NOT_FOUND' });
    // La convocatoria hereda el proceso de su capacitacion: programar fuera del alcance es
    // programar en el plan de otro.
    assertScopeAllows(actor.scopeProcessIds, version.activity.processId);
    /**
     * SE PUEDE PROGRAMAR CON EL CONTENIDO EN BORRADOR (Decision #77).
     *
     * Aqui se rechazaba si la version no estaba publicada, y eso obligaba a un orden que no hace
     * falta: para planear el ano en enero —"Manejo defensivo, marzo, Cali"— el contenido todavia
     * no existe, asi que o se publicaba una capacitacion vacia o no se podia planear. Lo dijo el
     * cliente: *"esto hace mas lento el proceso"*.
     *
     * Y no protegia nada, porque **la compuerta de verdad ya estaba en `publish()`**: una
     * convocatoria no se publica si su version no lo esta. Es ahi donde importa —publicar es lo
     * que cita a la gente y congela los proyectados— y es ahi donde sigue.
     *
     * El invariante que se defiende no cambia ni un milimetro: **nadie queda citado a contenido
     * que todavia puede cambiar**. Una convocatoria en borrador no cita a nadie, no congela
     * proyectados, no abre el candado y no deja aprobar el plan (`PLAN_OFFERINGS_NOT_PUBLISHED`).
     * Lo unico que hace es reservar el sitio en el calendario, que es exactamente lo que se hace
     * al planear un ano.
     */
    if (version.status === 'RETIRED') {
      throw new ConflictException({
        code: 'VERSION_RETIRED',
        message: 'Esa version quedo atras: programa sobre la version vigente.',
      });
    }

    // La tajada se resuelve ANTES de la transaccion: buscar o crear la audiencia toca varias
    // tablas y no tiene por que alargar la transaccion que reserva el consecutivo.
    const tajada = await this.resolveAudience(tenantId, input.audienceScope);

    const year = input.scheduledDate ? Number(input.scheduledDate.slice(0, 4)) : new Date().getFullYear();
    const offering = await this.prisma.tx(async (tx) => {
      const value = await this.sequences.next(tx, tenantId, 'OFFERING', year);
      return tx.offering.create({
        data: {
          tenantId,
          activityVersionId: input.activityVersionId,
          code: this.sequences.format('CONV', year, value),
          ...this.writableFields(input),
          ...tajada,
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

    await this.entraSolaAlPlan(actor, tenantId, offering.id, offering.code, version.activity.activityType.config, input);
    return this.getById(actor, offering.id);
  }

  /**
   * PROGRAMAR ES PONER EN EL PLAN, cuando la formacion es del plan (Decision #75).
   *
   * Habia tres caminos para crear una jornada —el plan, la pestana Programacion de la ficha y el
   * modulo Convocatorias— y solo el primero creaba el renglon. Por los otros dos la jornada
   * quedaba huerfana: se dicta, la gente asiste, y no cuenta para el cumplimiento de nadie.
   *
   * Se hace en el SERVIDOR y no en la pantalla por la misma razon que la exigencia automatica
   * (Decision #69): depender de que alguien pase por una pantalla es depender de que se acuerde.
   *
   * Solo en plan BORRADOR. Un renglon en un plan vivo nace obligando a gente real y la Decision
   * #55 exige decir por que; un motivo no se inventa por detras, asi que ahi lo pregunta la ficha.
   * Se escribe la fila directamente y no via `PlansService` porque un renglon de borrador es solo
   * eso —una fila, sin obligaciones que materializar— y porque el modulo del plan ya importa este.
   */
  private async entraSolaAlPlan(
    actor: AuthUser,
    tenantId: string,
    offeringId: string,
    offeringCode: string,
    typeConfig: unknown,
    input: CreateOfferingInput,
  ): Promise<void> {
    const config = (typeConfig ?? {}) as Record<string, unknown>;
    const fecha = input.scheduledDate ?? input.windowStart ?? null;
    const planes = await this.prisma.scoped.trainingPlan.findMany({ select: { id: true, year: true, status: true } });

    const destino = renglonAutomatico(config.participatesInPlan === true, fecha, planes, new Date());
    if (!destino) return;

    // `skipDuplicates` no aplica sin indice unico, asi que se comprueba: quien crea la jornada
    // DESDE el plan agrega el renglon el mismo justo despues, y dos renglones de la misma
    // convocatoria contarian dos veces en el cumplimiento.
    const yaEsta = await this.prisma.scoped.planItem.findFirst({
      where: { planId: destino.planId, offeringId },
      select: { id: true },
    });
    if (yaEsta) return;

    const item = await this.prisma.scoped.planItem.create({
      data: { tenantId, planId: destino.planId, offeringId, plannedMonth: destino.plannedMonth },
    });
    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'PLAN_ITEM_ADDED',
      resourceType: 'plan_items',
      resourceId: item.id,
      newValues: {
        planId: destino.planId,
        offering: offeringCode,
        plannedMonth: destino.plannedMonth,
        automatico: 'La formacion es del plan y el plan del ano estaba en borrador (Decision #75).',
      },
    });
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
      data: {
        ...this.writableFields(input),
        ...(await this.resolveAudience(this.prisma.currentTenantId, input.audienceScope)),
        updatedBy: actor.id,
        version: { increment: 1 },
      },
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
    return this.projected.derive(version.activityId, { audienceId: offering.audienceId, regionalId: offering.regionalId });
  }

  /**
   * Lo mismo, pero para una convocatoria que todavia se esta armando: la tajada llega como REGLA
   * y no como audiencia, porque la audiencia se crea al guardar. Sale del mismo servicio que
   * congela al publicar, asi que lo que se ve al cortar es lo que se va a guardar.
   */
  async previewProjectedForForm(input: PreviewProjectedInput) {
    const version = await this.prisma.scoped.activityVersion.findUnique({
      where: { id: input.activityVersionId },
      select: { activityId: true },
    });
    if (!version) throw new NotFoundException({ code: 'ACTIVITY_VERSION_NOT_FOUND' });
    return this.projected.preview(version.activityId, {
      audienceId: null,
      regionalId: input.regionalId,
      rule: input.scope,
    });
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
    /**
     * LA COMPUERTA DE VERDAD (Decision #77). Programar con el contenido en borrador se permite —es
     * como se planea un ano— pero PUBLICAR la convocatoria es lo que cita a la gente y congela los
     * proyectados, y eso no puede pasar sobre contenido que todavia puede cambiar.
     *
     * El mensaje dice QUE hacer, no solo que no se puede: quien llega aqui casi siempre no sabe
     * que le falta publicar el contenido, porque la convocatoria ya la tiene delante y armada.
     */
    if (!version || version.status !== 'PUBLISHED') {
      throw new ConflictException({
        code: 'VERSION_NOT_PUBLISHED',
        message:
          'Publica primero el contenido de la formacion. Hasta entonces esta convocatoria puede quedar programada, pero no se puede abrir a la gente.',
      });
    }

    const derived = await this.projected.derive(version.activityId, { audienceId: offering.audienceId, regionalId: offering.regionalId });
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

    /**
     * A quien estaba CITADO se le avisa, y las obligaciones que nacieron del plan se RETIRAN.
     *
     * Cancelar solo movia dos estados —la convocatoria y su renglon— y dejaba a la gente igual:
     * quien estaba convocado seguia creyendo que tiene una sesion el 12 de marzo, y quien tenia
     * la obligacion del plan la conservaba viva, venciendo el ultimo dia de un mes cuya jornada
     * ya no se iba a dictar. Cancelar tiene que llegar hasta las personas o no es cancelar.
     *
     * Es la misma regla que cancelar el renglon desde el plan (Decision #73): se RETIRAN, no se
     * borran, y lo ya EMPEZADO no se toca porque ese avance es de la persona.
     */
    const renglones = await this.prisma.scoped.planItem.findMany({
      where: { offeringId: id },
      select: { id: true },
    });
    // El nombre de la formacion se pide aparte: `requireOffering` devuelve escalares.
    const nombre = await this.prisma.scoped.activityVersion.findUnique({
      where: { id: offering.activityVersionId },
      select: { activity: { select: { name: true } } },
    });
    const inscritos = await this.prisma.scoped.enrollment.findMany({
      where: { offeringId: id, status: { in: ['ENROLLED', 'IN_PROGRESS'] } },
      select: { user: { select: { id: true, email: true } } },
    });

    await this.prisma.tx(async (tx) => {
      await tx.offering.update({
        where: { id },
        data: { status: 'CANCELLED', cancelledReason: input.cancelledReason, updatedBy: actor.id },
      });
      /*
        El renglon del plan refleja la realidad: una convocatoria cancelada no queda "planeada".

        Y TAMPOCO "REPROGRAMADA" (2026-09-04). Solo se miraba `PLANNED`, asi que un renglon al que
        alguien le habia cambiado el mes —queda en `RESCHEDULED`, que es lo correcto al moverlo— se
        quedaba diciendo que estaba reprogramado despues de cancelar la jornada. Y es falso: no se
        reprogramo a ninguna parte, se cancelo. El plan lo seguia contando como programado, asi que
        el cumplimiento del ano se calculaba contra una jornada que nadie iba a dictar. Lo encontro
        el recorrido de punta a punta al reprogramar y cancelar en la misma corrida.

        Se excluyen los terminales: lo ya EJECUTADO no se cancela hacia atras.
      */
      await tx.planItem.updateMany({
        where: { offeringId: id, status: { in: ['PLANNED', 'RESCHEDULED'] } },
        data: { status: 'CANCELLED' },
      });
      if (renglones.length > 0) {
        await tx.assignment.updateMany({
          where: {
            planItemId: { in: renglones.map((row) => row.id) },
            source: 'PLAN',
            status: { in: ['PENDING', 'OVERDUE'] },
          },
          data: { status: 'WITHDRAWN_PLAN_ITEM_CANCELLED' },
        });
      }
    });

    if (inscritos.length > 0) {
      await this.notifications.notifyMany(
        this.prisma.currentTenantId,
        inscritos.map((row) => ({
          eventType: 'OFFERING_CANCELLED' as const,
          recipientUserId: row.user.id,
          recipientEmail: row.user.email,
          subject: 'Se cancelo una formacion a la que estabas citado',
          body: `${nombre?.activity.name ?? 'La formacion'}: ${input.cancelledReason}`,
          referenceType: 'offerings',
          referenceId: id,
        })),
      );
    }

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


  /**
   * PONER AL DIA LAS CONVOCATORIAS PERMANENTES al publicar una version nueva.
   *
   * La cautela de "una version nueva no cambia lo que entrega una convocatoria abierta" es
   * correcta cuando hay gente CITADA a una sesion con fecha: cambiarles el contenido tres dias
   * antes, sin avisar, no puede pasar solo.
   *
   * Pero en una convocatoria PERMANENTE no hay nadie citado: es una puerta abierta por la que la
   * gente entra cuando puede. Dejarla anclada a la version vieja significa que quien ingrese
   * manana hace la induccion desantiguada mientras la nueva espera a que alguien se acuerde de
   * pulsar "actualizar". Es el mismo fallo silencioso de siempre: el sistema sabe lo que hay que
   * hacer y espera a que alguien lo adivine.
   *
   * A quien esta a mitad lo decide la POLITICA DE MIGRACION que ya se eligio al publicar: aqui no
   * se toma ninguna decision nueva, solo se aplica la que ya se tomo.
   */
  async ponerAlDiaLasPermanentes(actor: AuthUser, activityId: string, targetVersionId: string): Promise<number> {
    const abiertas = await this.prisma.scoped.offering.findMany({
      where: {
        kind: 'PERMANENT',
        status: { in: ['PUBLISHED', 'IN_PROGRESS'] },
        activityVersion: { activityId },
        activityVersionId: { not: targetVersionId },
      },
      select: { id: true },
    });

    let movidas = 0;
    for (const offering of abiertas) {
      try {
        await this.migrateVersion(actor, offering.id, { targetVersionId, confirm: true });
        movidas += 1;
      } catch {
        // Una que no se pueda mover no puede tumbar la publicacion: el contenido ya esta
        // congelado, que es lo que importa. La convocatoria seguira avisando en su pantalla.
      }
    }
    return movidas;
  }


  /**
   * ABRIRLA SOLA al publicar, cuando el tipo dice que se hace "disponible siempre".
   *
   * Es el ultimo agujero del ciclo: se publicaba el contenido, la formacion quedaba exigida a
   * quien tocara, y **nadie podia empezarla** porque no existia ninguna convocatoria. El candado
   * de "todavia no esta abierta" salia en los pendientes de todo el mundo hasta que alguien se
   * acordara de pulsar "Dejarla disponible".
   *
   * Y ahi no hay ninguna decision: una convocatoria permanente no tiene fecha, ni lugar, ni
   * instructor, ni cupo que elegir. Es literalmente abrir la puerta.
   *
   * Solo si NO hay ninguna: si alguien ya programo una jornada con fecha, esa es su decision y no
   * se le anade otra por detras.
   */
  async abrirlaSiEsDisponible(
    actor: AuthUser,
    activityId: string,
    versionId: string,
    modality: Modality,
  ): Promise<boolean> {
    const yaHay = await this.prisma.scoped.offering.count({
      where: { activityVersion: { activityId }, status: { notIn: ['CANCELLED'] } },
    });
    if (yaHay > 0) return false;

    try {
      const offering = await this.create(actor, {
        activityVersionId: versionId,
        kind: 'PERMANENT',
        modality,
        executedBy: 'PROPIOS',
      });
      await this.publish(actor, offering.id, { confirm: true });
      return true;
    } catch {
      // No puede tumbar la publicacion: el contenido ya quedo congelado. La pestana de
      // convocatorias seguira avisando de que nadie puede hacerla.
      return false;
    }
  }

  // ─────────────────────────── Inscritos ───────────────────────────

  /**
   * QUIEN FALTA POR CONVOCAR a esta jornada.
   *
   * Es la pregunta que el analista se hace de verdad —"¿ya cite a todos los que me tocan?"— y que
   * antes solo se podia responder cruzando dos pantallas a ojo. La cuenta:
   *
   *     los OBLIGADOS abiertos de esta formacion
   *     ∩ la TAJADA de esta jornada (a quienes atiende)
   *     − quienes ya estan inscritos en CUALQUIER jornada de esta formacion
   *
   * Lo ultimo importa: a quien ya se cito el 12 de marzo en Antioquia no "le falta" nada porque no
   * este en la del 19 en Cundinamarca. Si se restaran solo los de ESTA jornada, cada convocatoria
   * reclamaria a la empresa entera y el numero seria inutil.
   */
  async pendingInvites(id: string) {
    const offering = await this.requireOffering(id);
    const version = await this.prisma.scoped.activityVersion.findUnique({
      where: { id: offering.activityVersionId },
      select: { activityId: true },
    });
    if (!version) throw new NotFoundException({ code: 'ACTIVITY_VERSION_NOT_FOUND' });

    const proyectados = await this.projected.resolve(version.activityId, {
      audienceId: offering.audienceId,
      regionalId: offering.regionalId,
    });

    const yaCitados = await this.prisma.scoped.enrollment.findMany({
      where: {
        userId: { in: proyectados.userIds },
        activityVersion: { activityId: version.activityId },
      },
      select: { userId: true, offeringId: true },
    });
    const citadoEn = new Map(yaCitados.map((row) => [row.userId, row.offeringId]));

    const faltanIds = proyectados.userIds.filter((userId) => !citadoEn.has(userId));
    const faltan = await this.prisma.scoped.user.findMany({
      where: { id: { in: faltanIds } },
      orderBy: { fullName: 'asc' },
      select: {
        id: true,
        fullName: true,
        documentNumber: true,
        jobTitle: { select: { name: true } },
        area: { select: { name: true } },
      },
    });

    return {
      /** A cuantos atiende esta jornada, hoy. */
      proyectados: proyectados.count,
      detalle: proyectados.detail,
      /** Cuantos de esos ya estan citados, aqui o en otra jornada de la misma formacion. */
      convocados: proyectados.userIds.length - faltanIds.length,
      /** Cuantos estan inscritos en ESTA. */
      enEstaJornada: yaCitados.filter((row) => row.offeringId === id).length,
      faltan,
    };
  }
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
        // LA ASISTENCIA Y EL PAPEL (Decision #157). La lista tiene que abrirse con lo que ya se
        // marco: volver a la jornada al dia siguiente y encontrarla en blanco haria que alguien la
        // tomara dos veces.
        attendedAt: true,
        extCertIssuer: true,
        extCertNumber: true,
        extCertIssuedAt: true,
        extCertValidUntil: true,
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
        // "Todos los obligados" significa los que ESTA jornada atiende: su TAJADA. Si no la
        // declara, la sede; y si tampoco, la empresa entera. Es el mismo alcance con el que se
        // derivan los proyectados, para que numerador y denominador hablen de la misma gente:
        // convocar a mas de los proyectados es inflar el numerador de la cobertura.
        ...(input.allAssigned ? { user: this.tajadaDeUsuarios(offering) } : {}),
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
    const candidatos = people.filter((person) => !enrolledAlready.has(person.id));

    /*
      ── SI NO CABEN TODOS, SE CONVOCA A LOS QUE CABEN (2026-09-04) ──────────────────────────────

      Antes fallaba ENTERO con `OFFERING_CAPACITY_EXCEEDED` y un mensaje que solo decia el cupo:
      "el cupo es de 30 personas". Ni convocaba a los treinta que si caben, ni decia cuantos
      obligados hay, ni cuantas sillas faltan, ni que la salida es partir en dos jornadas.

      Fallar era defendible —nadie quiere que el sistema elija 30 de 40 al azar— pero el problema no
      era elegir: era hacerlo **al azar**. Con un criterio que se pueda defender delante de un
      auditor, convocar a los que caben es mejor que no convocar a nadie:

        **primero quien esta mas cerca de incumplir**, es decir, quien vence antes.

      No es arbitrario y se explica en una frase. Quien se queda fuera no pierde nada —sigue
      obligado y sin inscribir, que es justo lo que la cobertura tiene que ensenar— y la respuesta
      dice cuantos faltan, para que se programe la otra jornada.
    */
    const sillasLibres = offering.capacity === null ? candidatos.length : offering.capacity - enrolledAlready.size;
    let toEnroll = candidatos;
    let sinCupo = 0;
    if (offering.capacity !== null && candidatos.length > sillasLibres) {
      const porVencimiento = await this.prisma.scoped.assignment.findMany({
        where: {
          targetType: 'ACTIVITY',
          targetId: version.activityId,
          userId: { in: candidatos.map((p) => p.id) },
          status: { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE'] },
        },
        select: { userId: true, dueAt: true },
        orderBy: { dueAt: 'asc' },
      });
      const orden = new Map<string, number>();
      porVencimiento.forEach((fila, i) => {
        if (!orden.has(fila.userId)) orden.set(fila.userId, i);
      });
      // Quien no tiene obligacion viva va al final: convocar antes a un obligado que a alguien que
      // no lo esta es el mismo criterio, llevado al borde.
      const ordenados = [...candidatos].sort(
        (a, b) => (orden.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (orden.get(b.id) ?? Number.MAX_SAFE_INTEGER),
      );
      toEnroll = ordenados.slice(0, Math.max(0, sillasLibres));
      sinCupo = candidatos.length - toEnroll.length;
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
      newValues: { enrolled: toEnroll.length, skipped: people.length - toEnroll.length, sinCupo },
    });
    // `sinCupo` es lo que la pantalla necesita para decir algo util: "convocados 30 de 47; faltan 17,
    // programa otra jornada". `skipped` es otra cosa —los que ya estaban inscritos— y mezclarlos
    // daria un numero que no significa nada.
    return { enrolled: toEnroll.length, skipped: people.length - toEnroll.length, sinCupo, capacity: offering.capacity };
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

  /**
   * La tajada declarada, resuelta a una audiencia.
   *
   * `undefined` (el campo no viaja) = no se toca lo que hubiera; `null` o sin facetas = atiende a
   * todos los obligados. Reutiliza `AudiencesService.findOrCreate`, que reconoce el grupo por su
   * FORMA: "los conductores" declarado aqui y marcado en Quienes son LA MISMA audiencia, no dos
   * gemelas.
   */
  private async resolveAudience(
    tenantId: string,
    scope: AudienceRule | null | undefined,
  ): Promise<{ audienceId: string | null } | Record<string, never>> {
    if (scope === undefined) return {};
    if (scope === null || ruleReachesEveryone(scope)) return { audienceId: null };
    const audience = await this.audiences.findOrCreate(tenantId, scope);
    return { audienceId: audience.id };
  }


  /**
   * El filtro de personas de la tajada de una jornada, para usarlo dentro de otra consulta.
   * Mismo criterio que `ProjectedAudienceService`: la audiencia declarada manda sobre la sede.
   */
  private tajadaDeUsuarios(offering: { audienceId: string | null; regionalId: string | null }): Prisma.UserWhereInput {
    if (offering.audienceId) {
      return { audienceMembers: { some: { audienceId: offering.audienceId, leftAt: null } } };
    }
    if (offering.regionalId) return { regionalId: offering.regionalId };
    return {};
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
