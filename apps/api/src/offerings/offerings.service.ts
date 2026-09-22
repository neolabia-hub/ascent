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
import { decidirCertificadoExterno, laDictaUnTercero } from '../certificates/certificate-policy.js';
import { queSeExige, seTomaLista } from './cierre-de-la-jornada.js';
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
  // QUIEN LA DICTO, para que la siguiente jornada de la misma formacion no lo pida otra vez: lo
  // normal es que la dicte el mismo (2026-09-06).
  executedBy: true,
  executedByOther: true,
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
   * ─── LA REGLA: HAY SALON O NO LO HAY (corregido el 2026-09-06) ───
   *
   * La primera version la ato al `kind`: toda jornada `EVENT` se cerraba por asistencia. Lo cazo
   * el cliente y tenia razon: **una capacitacion del plan puede ser EVENT y VIRTUAL con contenido**
   * —tiene fecha, se convoca, y aun asi la persona entra a la plataforma y hace el temario—, y ahi
   * pedir asistencia es pedir la evidencia equivocada.
   *
   * El argumento con el que se defendio el `kind` era el webinar en vivo: un caso que el cliente NO
   * tiene y que se invento para justificar la regla. Su realidad es la contraria — las inducciones
   * especificas son TODAS presenciales, y el plan es casi todo virtual con contenido.
   *
   * Lo que de verdad decide es si **queda rastro en la plataforma**, y eso lo dice la MODALIDAD:
   *
   *   PRESENCIAL  hay salon y lista firmada; en la plataforma no queda nada   -> ASISTENCIA
   *   HIBRIDA     hay sesion Y contenido: se exigen las dos (CLAUDE.md 3.7)   -> ASISTENCIA
   *   VIRTUAL     la persona entra y hace el temario, y el sistema lo registra -> PLATAFORMA
   *
   * Y sigue haciendo falta que **no sea de autoservicio**: una PERMANENTE se acredita sola por
   * definicion —nadie convoca a un salon permanente— y una PERMANENTE marcada PRESENCIAL es un dato
   * mal puesto, no un caso de uso.
   *
   * Un webinar en vivo del que se quiera lista se programa PRESENCIAL o HIBRIDA. Se dice aqui en vez
   * de forzarlo con una regla: el sitio donde se decide es la convocatoria.
   *
   * ─── LOS TRES ESTADOS, Y EL CUARTO QUE ES NO MANDAR LA FILA ───
   *
   * PRESENTE / AUSENTE / JUSTIFICADO (CLAUDE.md 3.7), y `null` = todavia sin revisar. "Convocado y
   * NO vino" es exactamente lo que hay que poder demostrar, y es distinto de "todavia no lo hemos
   * mirado": por eso el estado es explicito y no se deduce de un campo vacio.
   *
   * **JUSTIFICADO no exime la formacion.** Explica por que no vino a ESA jornada, no que ya no
   * tenga que formarse: la sigue debiendo y va a la siguiente. Eximir es otro acto, deliberado, con
   * su propio motivo y su propia auditoria — mezclarlos convertiria "estaba incapacitado" en "ya no
   * tiene que hacerlo".
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
    /*
      LA PUERTA ES «¿SE TOMA LISTA?», NO «¿LA LISTA CIERRA?» (2026-09-21).

      Antes era `cierraPorLista`, y por eso una jornada que se acredita con el contenido no podia
      registrar ninguna asistencia: ni lista, ni QR, ni firma, ni acta. Eso confundia dos cosas —lo
      que ACREDITA y lo que se DOCUMENTA— y dejaba fuera el caso real que pidio el cliente: el curso
      con evaluacion donde ademas hay que dejar constancia de que la persona estuvo.

      Con `seTomaLista` la evidencia se puede tomar siempre que la jornada diga que hay lista. Que
      esa marca cierre algo o no lo decide despues `queSeExige`, en un sitio distinto y a proposito.
    */
    if (!seTomaLista(offering)) {
      throw new ConflictException({
        code: 'OFFERING_NOT_ATTENDABLE',
        message:
          'Esta jornada no toma lista: se acredita con lo que cada persona complete en la plataforma. Si además hubo una sesión, marca «Se toma lista de asistencia» en la convocatoria.',
      });
    }
    if (offering.status === 'DRAFT' || offering.status === 'CANCELLED') {
      throw new ConflictException({ code: 'OFFERING_NOT_ATTENDABLE', status: offering.status });
    }

    const tenantId = this.prisma.currentTenantId;
    const exigencia = queSeExige(offering);
    const conCertificado = input.items.filter((fila) => fila.certificate);
    const { quienLaDicto } = await this.contextoDeLaJornada(offeringId);
    /*
      LA COMPUERTA MIRA LA FORMACION, NO QUIEN DICTA.

      `registraCertificado` es lo que la PANTALLA usa para decidir que campos enseñar, y ahi si pesa
      quien dicta la jornada. Rechazar por eso convertiria una suposicion —"si la dicta la empresa no
      hay papel"— en una regla del producto, y hay tenants para los que es falsa. La compuerta se
      queda donde la empresa lo declara: en la formacion, con su tipo de respaldo.
    */
    const laFormacionLoLleva = await this.laFormacionLlevaPapel(offeringId);
    if (conCertificado.length > 0 && !laFormacionLoLleva) {
      /*
        LA COMPUERTA VIVE EN EL SERVIDOR, no solo en la pantalla.

        Que una clase de formacion se acredite con el papel de un tercero lo decide la empresa en
        `activity_types.config.tracksExternalCertificate` —una recertificacion si, una charla de
        quince minutos no—. Un control que solo existe en el navegador no es un control.
      */
      throw new ConflictException({
        code: 'TYPE_DOES_NOT_TRACK_EXTERNAL_CERT',
        message:
          'Esta formación no lleva certificado de un tercero. Se cambia en su ficha, o en Configuración → Tipos de formación para toda su clase.',
      });
    }

    // Solo las inscripciones de ESTA jornada: mandar el id de otra cerraria la formacion de alguien
    // que no estuvo aqui.
    // A QUIEN se puede marcar, y de paso su `userId`: la evidencia se guarda por PERSONA y jornada
    // (`attendance_records` tiene `UNIQUE(offering_id, user_id)`), no por inscripcion. Mandar el id
    // de una inscripcion de otra jornada cerraria la formacion de alguien que no estuvo aqui.
    const validas = new Map(
      (
        await this.prisma.scoped.enrollment.findMany({
          where: { offeringId, id: { in: input.items.map((fila) => fila.enrollmentId) } },
          select: { id: true, userId: true },
        })
      ).map((fila) => [fila.id, fila.userId]),
    );

    const heldOn = input.heldOn ? new Date(`${input.heldOn}T12:00:00-05:00`) : new Date();

    /*
      UN CERTIFICADO NO PUEDE VENCER ANTES DE LA JORNADA QUE LO ORIGINA (2026-09-06).

      Lo destapo `scripts/recorridos/asistencia-correcciones.mjs`, paso 9: el servidor aceptaba un
      papel con vencimiento de ayer y cerraba la formacion tan tranquilo. Lo que entra a la base es
      una habilitacion CADUCADA el mismo dia en que se registra — y como el papel MANDA sobre la
      recurrencia (Decision #157), esa fecha se copia a la obligacion y el informe de Vencimientos
      la saca en rojo sin que nadie sepa de donde salio.

      Casi siempre es el mismo error de captura: equivocarse de año al teclear. La pantalla ya pone
      su tope con `min`, pero un control que solo existe en el navegador no es un control — la misma
      leccion que la compuerta del tipo, veinte lineas mas arriba.

      Se comprueba TODO el lote antes de escribir nada: rechazar a mitad de camino dejaria media
      lista marcada y media no, y quien la tomo no tendria como saber por donde se quedo.
    */
    const conFechaImposible = input.items.filter((fila) => {
      const vence = fila.certificate?.validUntil;
      return vence ? new Date(`${String(vence).slice(0, 10)}T23:59:59-05:00`) < heldOn : false;
    });
    if (conFechaImposible.length > 0) {
      throw new ConflictException({
        code: 'CERT_EXPIRES_BEFORE_SESSION',
        message:
          'Hay un certificado que vence antes del día de la jornada. Revisa el año: un papel que ya caducó no acredita nada.',
      });
    }

    let cerradas = 0;
    let ausentes = 0;
    let justificados = 0;
    const ignoradas: string[] = [];

    for (const fila of input.items) {
      const userId = validas.get(fila.enrollmentId);
      if (!userId) {
        ignoradas.push(fila.enrollmentId);
        continue;
      }

      /*
        LA EVIDENCIA VA A `attendance_records`, QUE YA EXISTIA (corregido el 2026-09-05).

        La primera version de la Decision #157 le puso columnas propias a `enrollments` sin ver que
        esta tabla estaba en el esquema desde el Sprint 5 —con los tres estados, el metodo, la
        justificacion, la firma y quien marco— y vacia porque nadie la escribia. Dos casas para el
        mismo hecho es el problema que este proyecto ya conoce por el otro lado: el informe de
        Vencimientos leyendo `certification_grants`, que tampoco escribe nadie.

        `method: INSTRUCTOR` es el primero de los tres que preve el diseno (CLAUDE.md 3.7). El QR de
        sesion y la firma en pantalla escriben en esta MISMA tabla cuando se construyan, cambiando
        solo el metodo — por eso la columna existe desde el principio.

        Se re-marca sin miedo: `upsert` sobre la clave (jornada, persona). Corregir a alguien que se
        apunto mal no puede exigir borrar una fila a mano.
      */
      await this.prisma.scoped.attendanceRecord.upsert({
        where: { offeringId_userId: { offeringId, userId } },
        create: {
          tenantId,
          offeringId,
          userId,
          status: fila.estado,
          justification: fila.motivo ?? null,
          method: 'INSTRUCTOR',
          checkedAt: heldOn,
          markedBy: actor.id,
        },
        update: {
          status: fila.estado,
          justification: fila.motivo ?? null,
          method: 'INSTRUCTOR',
          checkedAt: heldOn,
          markedBy: actor.id,
        },
      });

      if (fila.estado !== 'PRESENT') {
        // NO se cierra nada y NO se retira la obligacion: quien no vino la SIGUE debiendo, que es
        // el punto entero de tomar asistencia. Una falta JUSTIFICADA explica por que no vino a esta
        // jornada, no que ya no tenga que formarse: ira a la siguiente.
        ausentes += 1;
        if (fila.estado === 'JUSTIFIED') justificados += 1;
        continue;
      }

      /*
        Y AQUI SE SEPARA LO QUE DOCUMENTA DE LO QUE ACREDITA (2026-09-21).

        La marca ya esta guardada arriba: eso pasa siempre, sea cual sea la exigencia, y es lo que
        pedia el 2.7 — el QR, la firma y el acta valen como constancia de que la persona estuvo
        aunque no sean lo que cierra.

        Lo que cambia es que pasa DESPUES:

          ATTENDANCE  la marca cierra, como siempre.
          BOTH        no cierra sola: se vuelve a evaluar, y cerrara solo si ademas ya aprobo.
          CONTENT     no cierra nada. La marca es evidencia y se acabo.
      */
      if (exigencia !== 'ATTENDANCE') {
        /*
          EL PAPEL SE GUARDA IGUAL, aunque esta lista no acredite (2026-09-21).

          El certificado de un tercero es EVIDENCIA, no una acreditacion: quien decide si la
          formacion queda cumplida es `queSeExige`, siempre. El instructor lo tiene en la mano al
          terminar la sesion, asi que este es el sitio donde se recoge de verdad — mandarlo a
          teclearlo persona por persona en Usuarios solo garantiza que se pierda.
        */
        if (fila.certificate) {
          await this.completion.registrarPapelSinCerrar(this.prisma.scoped, {
            enrollmentId: fila.enrollmentId,
            certificado: {
              issuer: fila.certificate.issuer ?? quienLaDicto,
              number: fila.certificate.number,
              issuedAt: fila.certificate.issuedAt ? new Date(`${fila.certificate.issuedAt}T12:00:00-05:00`) : null,
              validUntil: fila.certificate.validUntil
                ? new Date(`${fila.certificate.validUntil}T23:59:59-05:00`)
                : null,
              fileKey: fila.certificate.fileKey ?? null,
            },
          });
        }
        if (exigencia === 'BOTH') {
          // Puede que ya tuviera el contenido aprobado y solo faltara venir: entonces cierra aqui.
          const outcome = await this.completion.evaluateWith(this.prisma.scoped, tenantId, fila.enrollmentId);
          if (outcome.assignmentClosed) cerradas += 1;
        }
        continue;
      }

      const resultado = await this.completion.cerrarPorAsistencia(this.prisma.scoped, tenantId, {
        enrollmentId: fila.enrollmentId,
        attendedAt: heldOn,
        certificado: fila.certificate
          ? {
              // EL EMISOR SALE DE LA JORNADA si no lo mandan: quien la dicto ya esta ahi, y
              // teclearlo por cabeza es copiar cuarenta veces un dato que el sistema tiene.
              issuer: fila.certificate.issuer ?? quienLaDicto,
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
        justificados,
        conCertificadoExterno: conCertificado.length,
        acta: Boolean(input.attendanceSheetKey),
      },
    });

    // `acta` viaja en la respuesta y no solo en la auditoria: quien acaba de guardar tiene que
    // poder confirmar que el escaneo quedo, sin ir a mirar la jornada.
    return { revisadas: input.items.length, cerradas, ausentes, justificados, ignoradas, acta: Boolean(input.attendanceSheetKey) };
  }

  /**
   * LO QUE LA LISTA NECESITA SABER DE LA JORNADA, en una consulta.
   *
   * **¿Se acredita con el papel de un tercero?** Lo decide la FORMACION, y su tipo es el punto de
   * partida (`decidirCertificadoExterno`, la misma cascada que la constancia y la eficacia). Empezo
   * viviendo solo en el tipo y el cliente lo cazo: dentro de "capacitacion del plan" conviven la
   * charla de seguridad vial que no certifica nada y el curso de alturas que si.
   *
   * **¿Quien la dicto?** Para no teclear el emisor cuarenta veces. `executedByOther` es el nombre
   * escrito ("ARL Sura") y `executedBy` la clase (ARL, EPS, TEMPORALES...); se prefiere el primero
   * porque es lo que va a leer quien audite, y el segundo es el respaldo.
   */
  /**
   * ¿LA FORMACION lleva papel de un tercero? Es la compuerta, y mira solo la formacion con su tipo
   * de respaldo — no quien dicta la jornada, que es un DEFECTO de pantalla y no una regla.
   */
  private async laFormacionLlevaPapel(offeringId: string): Promise<boolean> {
    const fila = await this.prisma.scoped.offering.findUnique({
      where: { id: offeringId },
      select: {
        activityVersion: {
          select: {
            activity: {
              select: { tracksExternalCertificate: true, activityType: { select: { config: true } } },
            },
          },
        },
      },
    });
    const actividad = fila?.activityVersion.activity ?? null;
    if (!actividad) return false;
    return decidirCertificadoExterno(actividad.activityType ?? null, {
      tracksExternalCertificate: actividad.tracksExternalCertificate,
    });
  }

  private async contextoDeLaJornada(
    offeringId: string,
  ): Promise<{ registraCertificado: boolean; quienLaDicto: string }> {
    const fila = await this.prisma.scoped.offering.findUnique({
      where: { id: offeringId },
      select: {
        executedBy: true,
        executedByOther: true,
        activityVersion: {
          select: {
            activity: {
              select: { tracksExternalCertificate: true, activityType: { select: { config: true } } },
            },
          },
        },
      },
    });
    const actividad = fila?.activityVersion.activity ?? null;
    const tipo = actividad?.activityType ?? null;
    /*
      SI LA DICTA LA EMPRESA, NO HAY TERCERO QUE CERTIFIQUE (2026-09-06).

      El criterio y su porque entero viven ahora en `certificate-policy.ts`. Estaban escritos aqui
      dentro, y la consecuencia fue la que se paga siempre por copiar una regla en vez de importarla:
      la segunda puerta —*Papeles de un tercero*, en la ficha de la persona— no se entero, y enseñaba
      filas que se contradecian a si mismas (`PENDIENTES` 2.5).

      Lo que NO es, y conviene no olvidarlo al leerlo aqui: decide QUE CAMPOS PIDE la pantalla, no que
      se pueda guardar. La compuerta sigue siendo la de la formacion (409
      `TYPE_DOES_NOT_TRACK_EXTERNAL_CERT`).
    */
    const deUnTercero = laDictaUnTercero(fila?.executedBy);
    return {
      registraCertificado:
        actividad && deUnTercero
          ? decidirCertificadoExterno(tipo, { tracksExternalCertificate: actividad.tracksExternalCertificate })
          : false,
      quienLaDicto: (fila?.executedByOther ?? '').trim() || (fila?.executedBy ?? 'PROPIOS'),
    };
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

    /*
      LA CASCADA SE RESUELVE AQUI, no en la pantalla.

      "¿Esta formacion se acredita con el papel de un tercero?" sale de la FORMACION con su tipo de
      respaldo (`decidirCertificadoExterno`). Devolver los dos datos crudos y que la pantalla los
      combine seria una segunda implementacion de la misma regla, y dos implementaciones acaban
      discrepando — es lo mismo que ya decidio `lib/activity-type.ts` para el resto del config.

      `quienLaDicto` viaja al lado porque es lo que la lista de asistencia va a poner como emisor sin
      que nadie lo teclee cuarenta veces.
    */
    const contexto = await this.contextoDeLaJornada(offering.id);

    return {
      ...offering,
      instructor,
      obligedCount: obliged,
      derivedProjected: derived,
      registraCertificadoExterno: contexto.registraCertificado,
      quienLaDicto: contexto.quienLaDicto,
      /*
        LAS DOS RESPUESTAS VIAJAN RESUELTAS DEL SERVIDOR, para que la pantalla no las reimplemente:
        dos implementaciones de la misma condicion acaban discrepando, y esta ya cambio dos veces
        —era el `kind`, luego la MODALIDAD, y ahora son dos preguntas—. Ver `marcarAsistencia`.

        `admiteAsistencia` conserva el nombre y pasa a significar «¿hay lista?», que es lo que la
        pantalla necesita para enseñar la pestaña. Lo que esa lista ACREDITA lo dice `exigencia`.
      */
      admiteAsistencia: seTomaLista(offering),
      exigencia: queSeExige(offering),
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
     * falta: para planear el año en enero —"Manejo defensivo, marzo, Cali"— el contenido todavia
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
     * al planear un año.
     */
    if (version.status === 'RETIRED') {
      throw new ConflictException({
        code: 'VERSION_RETIRED',
        message: 'Esa versión quedó atrás: programa sobre la versión vigente.',
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
        automatico: 'La formacion es del plan y el plan del año estaba en borrador (Decision #75).',
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
     * como se planea un año— pero PUBLICAR la convocatoria es lo que cita a la gente y congela los
     * proyectados, y eso no puede pasar sobre contenido que todavia puede cambiar.
     *
     * El mensaje dice QUE hacer, no solo que no se puede: quien llega aqui casi siempre no sabe
     * que le falta publicar el contenido, porque la convocatoria ya la tiene delante y armada.
     */
    if (!version || version.status !== 'PUBLISHED') {
      throw new ConflictException({
        code: 'VERSION_NOT_PUBLISHED',
        message:
          'Publica primero el contenido de la formación. Hasta entonces esta convocatoria puede quedar programada, pero no se puede abrir a la gente.',
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
        message: 'Sin publicar no hay proyectados congelados: el número se ajusta al publicar.',
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
        el cumplimiento del año se calculaba contra una jornada que nadie iba a dictar. Lo encontro
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
        message: 'Se publicó otra versión mientras decidías. Vuelve a revisar antes de mover a la gente.',
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
   * mañana hace la induccion desantiguada mientras la nueva espera a que alguien se acuerde de
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
        extCertIssuer: true,
        extCertNumber: true,
        extCertIssuedAt: true,
        extCertValidUntil: true,
        /*
          EL ESCANEO TAMBIEN VUELVE (2026-09-08). Se guardaba y no se devolvia, asi que al reabrir la
          lista el archivo adjunto no aparecia y parecia que no se habia subido — el mismo fallo que
          los estados de asistencia cuando no se sembraban. Es la clave, no el archivo: para verlo se
          pide firmada a .
        */
        extCertFileKey: true,
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

    /*
      LA ASISTENCIA SE PEGA APARTE, y de una sola consulta.

      `attendance_records` cuelga de la JORNADA y la PERSONA, no de la inscripcion, asi que Prisma no
      la puede traer anidada en el mismo select. Se piden todas las de esta jornada de un viaje y se
      cruzan en memoria: son las de una sesion, no las del tenant.

      `null` es un estado con significado —**todavia no se ha revisado**— y no es lo mismo que
      AUSENTE. La primera es trabajo pendiente; la segunda es evidencia de que se le convoco y no
      vino. Un dato que se lee por lo que le falta acaba significando dos cosas.
    */
    const asistencia = new Map(
      (
        await this.prisma.scoped.attendanceRecord.findMany({
          where: { offeringId: id },
          select: { userId: true, status: true, justification: true, method: true, checkedAt: true },
        })
      ).map((fila) => [fila.userId, fila]),
    );

    const items = enrollments.map((fila) => {
      const marca = asistencia.get(fila.user.id) ?? null;
      return {
        ...fila,
        attendanceStatus: marca?.status ?? null,
        attendanceNote: marca?.justification ?? null,
        attendanceMethod: marca?.method ?? null,
        attendedAt: marca?.status === 'PRESENT' ? marca.checkedAt : null,
      };
    });
    return { total: items.length, items };
  }

  /**
   * Inscribir = crear la EJECUCION. La inscripcion nace ENLAZADA a la obligacion que va a
   * satisfacer (Decision #2) y con el cargo, area y vinculacion de la persona congelados
   * (Decision #33): dentro de dos años el certificado debe decir el cargo que tenia ese dia.
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
      /*
        LO VIVO DE ESA FORMACION, NO SOLO LO DE ESTA JORNADA (2026-09-06).

        Se miraba `{ offeringId: id }`, asi que convocar a alguien que YA tenia una inscripcion viva
        de la misma formacion en OTRA convocatoria le creaba una segunda. Es el mismo fallo que
        `varias-convocatorias.mjs` encontro y arreglo el 2026-09-04 —*"al terminar una, la otra se
        queda viva para siempre"*— pero aquel se arreglo en el autoservicio (`learner.service`) y
        este camino, el del administrador, se quedo igual.

        LA ASISTENCIA LO VOLVIO ALCANZABLE en el flujo normal, y lo cazo el cliente preguntando por
        "las inducciones que pueden ser presenciales, como las especificas": ese tipo abre su
        convocatoria PERMANENTE sola al publicar, y despues alguien programa la jornada y convoca.

        MEDIDO antes del arreglo: la misma persona con `PERMANENT/ENROLLED` y `EVENT/COMPLETED`. Al
        cerrar la jornada por asistencia, la permanente se quedaba viva para siempre — contando como
        inscrita en los numeros de esa convocatoria y apareciendole a ella en sus pendientes.
      */
      this.prisma.scoped.enrollment.findMany({
        where: {
          userId: { in: input.allAssigned ? undefined : input.userIds },
          OR: [
            { offeringId: id },
            {
              status: { in: ['ENROLLED', 'IN_PROGRESS'] },
              activityVersion: { activityId: version.activityId },
            },
          ],
        },
        select: { id: true, userId: true, offeringId: true, status: true },
      }),
    ]);
    const enrolledAlready = new Set(already.filter((e) => e.offeringId === id).map((e) => e.userId));
    const candidatos = people.filter((person) => !enrolledAlready.has(person.id));

    /*
      LA QUE ESTABA VIVA EN OTRA CONVOCATORIA SE RETIRA, no se ignora.

      Reutilizarla —que es lo que hace el autoservicio— aqui no vale: la persona no saldria en la
      lista de ESTA jornada y no se le podria tomar asistencia, que es justo a lo que se le esta
      convocando. Y crear la segunda deja dos vivas.

      Asi que se retira la anterior con su motivo. **No se borra** (Decision #11: la evidencia se
      retira, no desaparece) y lo ya CUMPLIDO no se toca — solo lo que sigue abierto. Convocar a
      alguien a una jornada presencial es decir "esto lo vas a hacer aqui", y eso es exactamente lo
      que significa retirar la inscripcion online que no habia terminado.
    */
    const idsConvocados = new Set(candidatos.map((p) => p.id));
    const vivasEnOtra = already.filter(
      (e) => e.offeringId !== id && idsConvocados.has(e.userId) && (e.status === 'ENROLLED' || e.status === 'IN_PROGRESS'),
    );
    if (vivasEnOtra.length > 0) {
      await this.prisma.scoped.enrollment.updateMany({
        where: { id: { in: vivasEnOtra.map((e) => e.id) } },
        data: { status: 'WITHDRAWN' },
      });
      await this.audit.record({
        tenantId,
        userId: actor.id,
        action: 'ENROLLMENTS_WITHDRAWN_FOR_OFFERING',
        resourceType: 'offerings',
        resourceId: id,
        newValues: {
          motivo: 'Convocados a esta jornada: su inscripcion viva en otra convocatoria de la misma formacion se retira.',
          retiradas: vivasEnOtra.length,
        },
      });
    }

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
      obligado y sin inscribir, que es justo lo que la cobertura tiene que enseñar— y la respuesta
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
      // `undefined` = no vino y la columna no se toca; `null` = "lo que diga su modalidad", que es
      // un valor con significado y hay que poder volver a el (ver `cierre-de-la-jornada.ts`).
      completionRequirement: input.completionRequirement,
      takesAttendance: input.takesAttendance,
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
