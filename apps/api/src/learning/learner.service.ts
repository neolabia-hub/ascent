import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { POINTS, type SelfEnrollInput } from '@neo-pulse/shared';
import type { AuthUser } from '../common/types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { resolvePendingState } from './pending-state.js';

/** Obligaciones que todavia pesan sobre la persona. */
const OPEN_ASSIGNMENT: Prisma.EnumAssignmentStatusFilter = { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE'] };

/**
 * LO MIO: lo que debo, lo que estoy haciendo y lo que ya hice.
 *
 * Esta es la unica pantalla que la mayoria del personal operativo va a ver, y casi siempre desde
 * el telefono. Por eso responde una sola pregunta —"que me toca ahora"— y trae ya resuelto COMO
 * hacerlo: si hay una ejecucion abierta, su id; si hay una convocatoria de autoservicio, su id;
 * y si no hay ninguna via, lo dice en vez de dejar un boton que no lleva a ninguna parte.
 */
@Injectable()
export class LearnerService {
  constructor(private readonly prisma: PrismaService) {}

  async pending(actor: AuthUser) {
    const assignments = await this.prisma.scoped.assignment.findMany({
      where: { userId: actor.id, status: OPEN_ASSIGNMENT, targetType: 'ACTIVITY' },
      orderBy: [{ dueAt: 'asc' }, { assignedAt: 'asc' }],
      select: {
        id: true,
        targetId: true,
        dueAt: true,
        status: true,
        cycleNumber: true,
        source: true,
      },
    });

    const activityIds = [...new Set(assignments.map((assignment) => assignment.targetId))];
    const [activities, enrollments, offerings] = await Promise.all([
      this.prisma.scoped.activity.findMany({
        where: { id: { in: activityIds } },
        select: {
          id: true,
          name: true,
          description: true,
          activityType: { select: { code: true, name: true, colorHex: true } },
          coverKey: true,
          currentVersionId: true,
          versions: {
            where: { status: 'PUBLISHED' },
            orderBy: { versionNumber: 'desc' },
            take: 1,
            select: { id: true, estimatedMinutes: true },
          },
        },
      }),
      this.prisma.scoped.enrollment.findMany({
        where: { userId: actor.id, status: { in: ['ENROLLED', 'IN_PROGRESS'] } },
        select: {
          id: true,
          status: true,
          activityVersion: {
            select: {
              activityId: true,
              // CUANTAS PIEZAS TIENE la version que esta cursando, para el denominador. Se cuenta
              // aqui y no en la actividad: la version publicada es la que rige el intento, y una
              // version nueva puede tener mas piezas que la que esta persona empezo.
              _count: { select: { contents: true } },
            },
          },
          // Solo las TERMINADAS. El avance a medias de una pieza suelta no cuenta como progreso de
          // la formacion: para quien la esta haciendo, una leccion o esta hecha o no lo esta.
          progress: { where: { status: 'COMPLETED' }, select: { id: true } },
        },
      }),
      // Autoservicio: convocatoria permanente o mixta, publicada y dentro de su ventana.
      this.prisma.scoped.offering.findMany({
        where: {
          status: { in: ['PUBLISHED', 'IN_PROGRESS'] },
          kind: { in: ['PERMANENT', 'HYBRID'] },
          activityVersion: { activityId: { in: activityIds } },
        },
        select: {
          id: true,
          windowStart: true,
          windowEnd: true,
          activityVersion: { select: { activityId: true } },
        },
      }),
    ]);

    const activityById = new Map(activities.map((activity) => [activity.id, activity]));
    const enrollmentByActivity = new Map(enrollments.map((row) => [row.activityVersion.activityId, row]));
    const today = new Date();
    const offeringByActivity = new Map(
      offerings
        .filter((offering) => this.isOpenWindow(offering.windowStart, offering.windowEnd, today))
        .map((offering) => [offering.activityVersion.activityId, offering.id]),
    );

    return {
      items: assignments.map((assignment) => {
        const activity = activityById.get(assignment.targetId);
        const enrollment = enrollmentByActivity.get(assignment.targetId);
        const selfServiceOfferingId = enrollment ? null : (offeringByActivity.get(assignment.targetId) ?? null);
        return {
          assignmentId: assignment.id,
          activityId: assignment.targetId,
          title: activity?.name ?? 'Actividad formativa',
          description: activity?.description ?? null,
          type: activity?.activityType ?? null,
          estimatedMinutes: activity?.versions[0]?.estimatedMinutes ?? null,
          coverKey: activity?.coverKey ?? null,
          /*
            LO QUE GANA AL TERMINARLA. Viaja desde el servidor y no se escribe en la pantalla
            porque la promesa y el premio tienen que salir del mismo sitio: prometer 50 y dar 30
            es peor que no prometer nada (Decision #90). Y si algun dia los puntos dependen del
            tipo de formacion, ya tiene donde vivir.
          */
          pointsOnComplete: POINTS.ACTIVITY_COMPLETED,
          dueAt: assignment.dueAt,
          overdue: assignment.status === 'OVERDUE',
          cycleNumber: assignment.cycleNumber,
          source: assignment.source,
          enrollmentId: enrollment?.id ?? null,
          started: enrollment?.status === 'IN_PROGRESS',
          /*
            CUANTO LLEVA HECHO, en porcentaje (Decision #107).

            Sale del SERVIDOR y no de una estimacion de la pantalla: "vas por la mitad" es una
            afirmacion sobre el expediente de alguien, y en un producto donde ese expediente lo
            mira un auditor no puede depender de lo que un navegador crea recordar.

            `null` cuando no hay inscripcion o no tiene piezas: es distinto de 0 —que significa
            "empezada y sin nada hecho"— y la pantalla los pinta distinto.
          */
          progressPct: porcentajeDe(enrollment),
          /** Convocatoria de autoservicio donde puede empezarla por su cuenta. */
          selfServiceOfferingId,
          /*
            EL ESTADO YA RESUELTO (Decision #101). La pantalla no reconcilia banderas: recibe UNO.

            Mandando las banderas sueltas (overdue, enrollmentId, selfServiceOfferingId), la web llego a
            decir "Vencio hace 3 dias" y "todavia no esta abierta, deben convocarte" en la misma
            tarjeta: un retraso reclamado a quien no podia empezar. Basta que un cliente se
            despiste para que vuelva, asi que se decide aqui y viaja decidido.
          */
          ...resolvePendingState(
            {
              overdue: assignment.status === 'OVERDUE',
              dueAt: assignment.dueAt,
              enrollmentId: enrollment?.id ?? null,
              started: enrollment?.status === 'IN_PROGRESS',
              selfServiceOfferingId,
            },
            today,
          ),
        };
      }),
    };
  }

  /** Mi historial: lo que ya hice, con su nota. Es la hoja de vida formativa de la persona. */
  async history(actor: AuthUser) {
    const enrollments = await this.prisma.scoped.enrollment.findMany({
      where: { userId: actor.id, status: { in: ['COMPLETED', 'PASSED', 'FAILED'] } },
      orderBy: { completedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        status: true,
        completedAt: true,
        finalScore: true,
        scoreSnapshot: true,
        offering: {
          select: {
            code: true,
            scheduledDate: true,
            activityVersion: {
              select: {
                versionNumber: true,
                // El tipo viaja para que la portada del historial sea la misma que la del
                // catalogo: la identidad visual de una formacion no puede cambiar de pantalla.
                activity: {
                  select: {
                    id: true,
                    name: true,
                    activityType: { select: { code: true, name: true, colorHex: true } },
          coverKey: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    return { items: enrollments };
  }

  /**
   * Empezar por cuenta propia una convocatoria de autoservicio. La inscripcion nace ENLAZADA a
   * la obligacion que va a satisfacer (Decision #2) y con el cargo y area de HOY congelados
   * (Decision #33): el certificado debe decir el cargo que tenia el dia que la hizo.
   */
  async selfEnroll(actor: AuthUser, input: SelfEnrollInput) {
    const tenantId = this.prisma.currentTenantId;
    const offering = await this.prisma.scoped.offering.findUnique({
      where: { id: input.offeringId },
      select: {
        id: true,
        kind: true,
        status: true,
        capacity: true,
        windowStart: true,
        windowEnd: true,
        activityVersionId: true,
        activityVersion: {
          select: { activityId: true, versionNumber: true, passingScore: true, activity: { select: { name: true } } },
        },
        _count: { select: { enrollments: true } },
      },
    });
    if (!offering) throw new NotFoundException({ code: 'OFFERING_NOT_FOUND' });
    if (offering.status !== 'PUBLISHED' && offering.status !== 'IN_PROGRESS') {
      throw new ConflictException({ code: 'OFFERING_NOT_OPEN' });
    }
    if (offering.kind === 'EVENT') {
      throw new ConflictException({
        code: 'OFFERING_NOT_SELF_SERVICE',
        message: 'Esta convocatoria tiene fecha y cupo: te inscribe quien la programa.',
      });
    }
    if (!this.isOpenWindow(offering.windowStart, offering.windowEnd, new Date())) {
      throw new ConflictException({ code: 'OFFERING_WINDOW_CLOSED', message: 'Esta formación no esta disponible hoy.' });
    }

    /*
      UNA INSCRIPCION VIVA POR FORMACION, no por convocatoria (2026-09-04).

      Se miraba solo `offeringId`, asi que con DOS convocatorias permanentes publicadas del mismo
      contenido —que el sistema permite: salen de "creo otra por si acaso" o de un doble clic— la
      misma persona acababa con DOS inscripciones de la misma formacion. Medido en el recorrido de
      varias convocatorias.

      El daño no es cosmetico: la obligacion es UNA, asi que al terminar una se cierra la obligacion
      y **la otra inscripcion se queda viva para siempre**; y los numeros de ejecucion cuentan dos
      inscritos donde hay una persona, lo que infla la asistencia y la cobertura de la jornada.

      Se mira lo VIVO y no todo el historial a proposito: una formacion que se repite —la
      reinduccion del año que viene— necesita inscripcion nueva, y la anterior ya esta terminada.
    */
    const existing = await this.prisma.scoped.enrollment.findFirst({
      where: {
        userId: actor.id,
        OR: [
          { offeringId: offering.id },
          {
            status: { in: ['ENROLLED', 'IN_PROGRESS'] },
            activityVersion: { activityId: offering.activityVersion.activityId },
          },
        ],
      },
      orderBy: { enrolledAt: 'asc' },
      select: { id: true },
    });
    if (existing) return { enrollmentId: existing.id, created: false as const };

    if (offering.capacity !== null && offering._count.enrollments >= offering.capacity) {
      throw new ConflictException({ code: 'OFFERING_CAPACITY_EXCEEDED' });
    }

    const [person, assignment] = await Promise.all([
      this.prisma.scoped.user.findUniqueOrThrow({
        where: { id: actor.id },
        select: { employmentType: true, jobTitle: { select: { name: true } }, area: { select: { name: true } } },
      }),
      this.prisma.scoped.assignment.findFirst({
        where: {
          userId: actor.id,
          targetType: 'ACTIVITY',
          targetId: offering.activityVersion.activityId,
          status: OPEN_ASSIGNMENT,
        },
        orderBy: { dueAt: 'asc' },
        select: { id: true },
      }),
    ]);

    const enrollment = await this.prisma.scoped.enrollment.create({
      data: {
        tenantId,
        offeringId: offering.id,
        userId: actor.id,
        activityVersionId: offering.activityVersionId,
        assignmentId: assignment?.id ?? null,
        status: 'ENROLLED',
        scoreSnapshot: {
          activityName: offering.activityVersion.activity.name,
          versionNumber: offering.activityVersion.versionNumber,
          passingScore: offering.activityVersion.passingScore,
          jobTitle: person.jobTitle.name,
          area: person.area.name,
          employmentType: person.employmentType,
        } as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    await this.prisma.scoped.learningEvent.create({
      data: {
        tenantId,
        userId: actor.id,
        enrollmentId: enrollment.id,
        verb: 'LAUNCHED',
        objectType: 'offerings',
        objectId: offering.id,
        result: { selfService: true } as Prisma.InputJsonValue,
      },
    });
    return { enrollmentId: enrollment.id, created: true as const };
  }

  /** Una ventana vacia significa "siempre disponible". */
  private isOpenWindow(start: Date | null, end: Date | null, today: Date): boolean {
    if (start && today < start) return false;
    if (end) {
      // La ventana incluye su ultimo dia completo.
      const endOfLastDay = new Date(end.getTime() + 24 * 60 * 60 * 1000);
      if (today >= endOfLastDay) return false;
    }
    return true;
  }
}

/**
 * QUE PARTE DE LA FORMACION LLEVA HECHA, de 0 a 100.
 *
 * Cuenta PIEZAS TERMINADAS sobre piezas de la version, no minutos ni tiempo dentro: el tiempo
 * dice cuanto estuvo la pantalla abierta, y eso no es lo mismo que haber avanzado. Piezas hechas
 * sobre piezas totales es lo unico que significa lo que la barra promete.
 *
 * Devuelve `null` —y no 0— si no hay inscripcion o la version no tiene piezas. Cero significa
 * "esta empezada y no lleva nada", que es una informacion util y distinta de "no aplica".
 */
function porcentajeDe(
  enrollment: { activityVersion: { _count: { contents: number } }; progress: { id: string }[] } | undefined,
): number | null {
  if (!enrollment) return null;
  const total = enrollment.activityVersion._count.contents;
  if (total === 0) return null;
  // Se acota a 100: si alguna vez hubiera mas filas de progreso que piezas —una pieza retirada de
  // la version despues de hacerla— la barra no puede salirse de su carril.
  return Math.min(100, Math.round((enrollment.progress.length / total) * 100));
}
