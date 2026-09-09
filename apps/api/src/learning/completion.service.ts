import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService, type TenantPrisma } from '../prisma/prisma.service.js';
import { CertificatesService } from '../certificates/certificates.service.js';
import { EngagementService } from '../engagement/engagement.service.js';

export interface CompletionOutcome {
  status: 'IN_PROGRESS' | 'COMPLETED' | 'PASSED' | 'FAILED';
  /** Contenidos requeridos que faltan, para que la pantalla diga QUE falta y no solo "no". */
  missing: string[];
  assignmentClosed: boolean;
}

/**
 * CIERRE DEL CICLO. Es la pieza que une las tres capas del modelo:
 *
 *   la persona termina la EJECUCION -> se cumple su OBLIGACION -> el PLAN sube su cobertura
 *
 * Hasta el Sprint 3 la obligacion se creaba pero nada la cerraba: la cobertura del plan se
 * quedaba en cero por diseño, y era la deuda declarada de ese sprint. Aqui se paga.
 *
 * Cerrar la obligacion tambien habilita la RONDA SIGUIENTE del requisito recurrente (la
 * reinduccion del año que viene se cuenta desde que esta se completo, no desde su vencimiento).
 */
@Injectable()
export class CompletionService {
  private readonly logger = new Logger(CompletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engagement: EngagementService,
    private readonly certificates: CertificatesService,
  ) {}

  /**
   * Evalua si la ejecucion quedo completa y, si es asi, la cierra.
   *
   * Criterio: TODOS los contenidos requeridos completados; y si hay evaluacion requerida, haberla
   * aprobado. Se recalcula desde los hechos guardados en vez de confiar en un contador, para que
   * un progreso perdido por falta de señal no deje a alguien aprobado sin haber visto nada.
   */
  async evaluate(enrollmentId: string): Promise<CompletionOutcome> {
    const tenantId = this.prisma.currentTenantId;
    return this.evaluateWith(this.prisma.scoped, tenantId, enrollmentId);
  }

  async evaluateWith(db: TenantPrisma, tenantId: string, enrollmentId: string): Promise<CompletionOutcome> {
    const enrollment = await db.enrollment.findUnique({
      where: { id: enrollmentId },
      select: {
        id: true,
        userId: true,
        status: true,
        assignmentId: true,
        activityVersionId: true,
        blockedAt: true,
        activityVersion: {
          select: {
            activityId: true,
            passingScore: true,
            contents: {
              select: { id: true, title: true, type: true, isRequired: true, assessmentId: true },
              orderBy: { displayOrder: 'asc' },
            },
          },
        },
      },
    });
    if (!enrollment) return { status: 'IN_PROGRESS', missing: [], assignmentClosed: false };

    const [progress, passedAttempts] = await Promise.all([
      db.activityProgress.findMany({ where: { enrollmentId }, select: { activityContentId: true, status: true } }),
      db.attempt.findMany({ where: { enrollmentId, passed: true }, select: { assessmentId: true } }),
    ]);
    const doneContents = new Set(progress.filter((row) => row.status === 'COMPLETED').map((row) => row.activityContentId));
    const passedAssessments = new Set(passedAttempts.map((row) => row.assessmentId));

    const required = enrollment.activityVersion.contents.filter((content) => content.isRequired);
    const missing = required
      .filter((content) =>
        content.type === 'ASSESSMENT' && content.assessmentId
          ? !passedAssessments.has(content.assessmentId)
          : !doneContents.has(content.id),
      )
      .map((content) => content.title);

    if (missing.length > 0) {
      // Bloqueada por intentos agotados: la ejecucion queda REPROBADA, no eternamente en curso.
      if (enrollment.blockedAt) {
        await this.markStatus(db, enrollmentId, 'FAILED');
        return { status: 'FAILED', missing, assignmentClosed: false };
      }
      if (enrollment.status === 'ENROLLED') {
        await this.markStatus(db, enrollmentId, 'IN_PROGRESS');
      }
      return { status: 'IN_PROGRESS', missing, assignmentClosed: false };
    }

    // Con evaluacion de por medio, "aprobado" dice mas que "completado" y es lo que exige el
    // auditor; sin evaluacion, completar es todo lo que habia que hacer.
    const hasAssessment = required.some((content) => content.type === 'ASSESSMENT');
    const finalStatus = hasAssessment ? 'PASSED' : 'COMPLETED';

    if (enrollment.status === finalStatus) {
      return { status: finalStatus, missing: [], assignmentClosed: false };
    }

    const completedAt = new Date();
    await db.enrollment.update({
      where: { id: enrollmentId },
      data: { status: finalStatus, completedAt },
    });

    const assignmentClosed = await this.closeAssignment(db, enrollment, completedAt);

    await db.learningEvent.create({
      data: {
        tenantId,
        userId: enrollment.userId,
        enrollmentId,
        verb: finalStatus === 'PASSED' ? 'PASSED' : 'COMPLETED',
        objectType: 'activity_versions',
        objectId: enrollment.activityVersionId,
        result: { closedAssignment: assignmentClosed } as Prisma.InputJsonValue,
      },
    });

    await this.engagement.awardActivityCompleted(db, tenantId, enrollment.userId, enrollmentId).catch((error: unknown) => {
      // El reconocimiento nunca puede tumbar el registro formativo, que es el dato legal.
      this.logger.error(`No se pudo registrar el reconocimiento de ${enrollment.userId}`, error as Error);
    });

    /*
      LA CONSTANCIA NACE AQUI (Decision #110), no en un boton del panel.

      La alternativa era "generar constancia" a mano por cada persona que termina. Se descarta por
      lo mismo que el resto del cierre: depender de que alguien se acuerde es no tenerlo. Una
      constancia que no existe el dia que la pide el auditor vale igual que no haber capacitado.

      FUERA DE LA TRANSACCION del cierre y con `catch`, a proposito. Emitir necesita su propia
      transaccion —reserva un numero de serie con bloqueo de fila— y sobre todo: si la emision
      falla, la formacion TIENE que quedar terminada igual. El registro formativo es el dato legal;
      el papel se puede volver a emitir. Al reves seria perder lo importante por no poder imprimir
      lo secundario.
    */
    await this.certificates.emitirPorEjecucion(tenantId, enrollmentId).catch((error: unknown) => {
      this.logger.error(`No se pudo emitir la constancia de ${enrollmentId}`, error as Error);
    });

    return { status: finalStatus, missing: [], assignmentClosed };
  }

  /**
   * CERRAR POR ASISTENCIA (Decision #157). La segunda via de evidencia.
   *
   * ─── POR QUE NO PASA POR `evaluate` ───
   *
   * `evaluate` recalcula desde los hechos guardados en la plataforma: contenidos vistos y examenes
   * aprobados. Para una jornada de salon esos hechos no existen ni van a existir —el temario lo dio
   * un instructor y el examen, si lo hubo, lo puso en papel— asi que llamarla siempre devolveria
   * "faltan contenidos". No es un atajo alrededor de la regla: es que la evidencia es OTRA.
   *
   * ─── LO QUE ESO OBLIGA A REGISTRAR ───
   *
   * Cerrar asi **salta la evaluacion que exige el tipo**, y eso es exactamente lo que un auditor
   * cuestionaria. Quien respondio por ello queda en el `AttendanceRecord` (`marked_by`, con su
   * metodo y su sello de tiempo) ademas de en la fila de auditoria: sin eso seria una puerta
   * trasera para dar por cumplido lo que no se hizo. Esta funcion solo CIERRA; la evidencia de la
   * asistencia la escribe quien toma la lista.
   *
   * ─── Y LA CONSTANCIA, QUE LA DECIDE EL TIPO Y NADA MAS ───
   *
   * Cerrar por asistencia emite exactamente lo que emitiria cerrar por contenido: lo que diga
   * `issuesCertificate` con su cascada de tipo y ficha (Decision #111). Aqui hubo una excepcion
   * —con papel de un tercero no se emitia la propia— que era una regla inventada y que el cliente
   * cazo: no son el mismo hecho, y ademas le quitaba al tenant una decision que ya podia tomar.
   */
  async cerrarPorAsistencia(
    db: TenantPrisma,
    tenantId: string,
    input: {
      enrollmentId: string;
      attendedAt: Date;
      certificado?: {
        issuer: string;
        number: string;
        issuedAt?: Date | null;
        validUntil?: Date | null;
        fileKey?: string | null;
      } | null;
    },
  ): Promise<{ closed: boolean; assignmentClosed: boolean }> {
    const enrollment = await db.enrollment.findUnique({
      where: { id: input.enrollmentId },
      select: {
        id: true,
        userId: true,
        status: true,
        assignmentId: true,
        activityVersionId: true,
        activityVersion: { select: { activityId: true } },
      },
    });
    if (!enrollment) return { closed: false, assignmentClosed: false };

    const cert = input.certificado ?? null;
    const yaCerrada = enrollment.status === 'COMPLETED' || enrollment.status === 'PASSED';

    await db.enrollment.update({
      where: { id: enrollment.id },
      data: {
        // PASSED diria que aprobo una evaluacion de la plataforma, y no la hubo. COMPLETED es lo
        // que de verdad consta: estuvo y la jornada se dicto.
        ...(yaCerrada ? {} : { status: 'COMPLETED', completedAt: input.attendedAt }),
        ...(cert
          ? {
              extCertIssuer: cert.issuer,
              extCertNumber: cert.number,
              extCertIssuedAt: cert.issuedAt ?? null,
              extCertValidUntil: cert.validUntil ?? null,
              extCertFileKey: cert.fileKey ?? null,
            }
          : {}),
      },
    });

    const assignmentClosed = yaCerrada
      ? false
      : await this.closeAssignment(db, enrollment, input.attendedAt, cert?.validUntil ?? null);

    /*
      EL PAPEL QUE LLEGA TARDE TAMBIEN TIENE QUE MOVER LA OBLIGACION (2026-09-06).

      ─── EL FALLO, QUE ERA DE LOS QUE NO SE VEN ───

      Cerrar y corregir compartian camino, y el de corregir no tenia salida: `closeAssignment` solo
      se llama cuando se cierra algo nuevo, y ademas corta en seco si la obligacion ya esta
      COMPLETED. Asi que cuando el certificado llegaba DESPUES —el caso normal, el papel de la ARL
      tarda quince dias— se guardaba en la inscripcion y su vencimiento **no llegaba nunca a la
      obligacion**.

      Lo que veia el usuario: registraba el papel, lo veia guardado en la lista, y no pasaba nada.
      Ni el motor programaba la ronda siguiente en la fecha correcta, ni el informe de Vencimientos
      se enteraba: la obligacion se quedaba con la fecha que calcula la recurrencia, que es justo la
      que el papel viene a corregir (Decision #157, EL PAPEL MANDA).

      Lo encontro `scripts/recorridos/asistencia-correcciones.mjs`, paso 5, escrito el mismo dia en
      que la pantalla empezo a ofrecer esta correccion.

      ─── POR QUE UNA FUNCION APARTE Y NO UN PARAMETRO MAS ───

      Porque son dos operaciones distintas, y mezclarlas fue el error de origen. Cerrar cambia el
      estado, pone la fecha de cumplimiento, apaga avisos y crea el evento de aprendizaje. Corregir
      la vigencia no hace nada de eso: solo escribe la fecha que dice el papel. Un parametro del
      tipo "y ademas no cierres" dentro de `closeAssignment` dejaria la misma trampa montada para el
      siguiente que pase por aqui.
    */
    if (yaCerrada && cert) {
      await this.actualizarVigenciaPorPapel(db, enrollment, cert.validUntil ?? null);
    }

    if (!yaCerrada) {
      await db.learningEvent.create({
        data: {
          tenantId,
          userId: enrollment.userId,
          enrollmentId: enrollment.id,
          verb: 'COMPLETED',
          objectType: 'activity_versions',
          objectId: enrollment.activityVersionId,
          result: { via: 'ATTENDANCE', closedAssignment: assignmentClosed } as Prisma.InputJsonValue,
        },
      });
    }

    /*
      LA CONSTANCIA PROPIA SE EMITE SIEMPRE QUE SU FORMACION LA PROMETA (corregido el 2026-09-06).

      Aqui habia una regla mia: "con papel de un tercero no se emite la propia, porque dos
      documentos con dos numeros para un mismo hecho confunden en una auditoria". Suena bien y
      estaba mal por dos motivos, y el cliente lo cazo: *"la constancia interna siempre debe darse"*.

      **No son el mismo hecho.** La constancia de la empresa dice "esta persona asistio a esta
      formacion el dia X" — es SU registro. El papel de la ARL dice "esta persona esta habilitada
      hasta Y" — es la habilitacion legal. Un auditor puede pedir cualquiera de los dos, y no tener
      el propio deja un hueco en el expediente que no tapa el ajeno.

      **Y sobre todo: era una regla que yo invente y que nadie podia cambiar.** Si una empresa no
      quiere las dos, ya tiene donde decirlo —`issuesCertificate`, con su cascada de tipo y ficha
      (Decision #111)— y meter aqui una excepcion cableada le quitaba esa decision. Todo lo que
      dependa de como trabaja una empresa se configura; lo que no, se deduce del modelo.

      Asi que esto solo pregunta si se esta cerrando algo nuevo. QUE se emite y a quien lo sigue
      decidiendo `emitirPorEjecucion` leyendo la cascada, igual que al cerrar por contenido.
    */
    if (!yaCerrada) {
      await this.certificates.emitirPorEjecucion(tenantId, enrollment.id).catch((error: unknown) => {
        this.logger.error(`No se pudo emitir la constancia de ${enrollment.id}`, error as Error);
      });
    }

    return { closed: !yaCerrada, assignmentClosed };
  }

  /**
   * Cierra la obligacion que esta ejecucion satisface. Si la persona lo hizo por su cuenta (sin
   * venir de una asignacion), igual se busca una obligacion viva de esa misma actividad: haberlo
   * hecho por iniciativa propia tambien cumple.
   */
  private async closeAssignment(
    db: TenantPrisma,
    enrollment: { id: string; userId: string; assignmentId: string | null; activityVersion: { activityId: string } },
    completedAt: Date,
    /**
     * Lo que dice el PAPEL de un tercero, cuando lo hay (Decision #157). Se copia AQUI y no se
     * deja solo en la inscripcion porque es el motor quien lo necesita: `proximoVencimiento` lo
     * lee para saber cuando vuelve a deberse, y la obligacion es la fila que el auditor rastrea.
     */
    validUntilOverride: Date | null = null,
  ): Promise<boolean> {
    const assignment = enrollment.assignmentId
      ? await db.assignment.findUnique({ where: { id: enrollment.assignmentId } })
      : await db.assignment.findFirst({
          where: {
            userId: enrollment.userId,
            targetType: 'ACTIVITY',
            targetId: enrollment.activityVersion.activityId,
            status: { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE'] },
          },
          orderBy: { dueAt: 'asc' },
        });
    if (!assignment || assignment.status === 'COMPLETED') return false;

    await db.assignment.update({
      where: { id: assignment.id },
      data: {
        status: 'COMPLETED',
        completedAt,
        completedEnrollmentId: enrollment.id,
        ...(validUntilOverride ? { validUntilOverride } : {}),
      },
    });

    // EL AVISO QUE YA NO PIDE NADA SE APAGA. "Tienes esta formacion asignada" deja de tener
    // sentido en cuanto la formacion esta hecha, y dejarlo sin leer hace que la campaña reclame
    // atencion por algo que la persona acaba de terminar.
    //
    // Se marca LEIDO, no se borra: sigue estando en "ver leidas", que es donde se comprueba que a
    // alguien se le aviso y cuando. Un registro que el sistema borra solo es un registro en el que
    // no se puede confiar.
    await db.notification.updateMany({
      where: {
        recipientUserId: enrollment.userId,
        channel: 'IN_APP',
        readAt: null,
        referenceType: 'activities',
        referenceId: enrollment.activityVersion.activityId,
      },
      data: { readAt: completedAt },
    });

    return true;
  }

  /**
   * LA VIGENCIA QUE DICE EL PAPEL, sobre una obligacion YA CERRADA.
   *
   * Es la mitad que faltaba de la Decision #157: el papel de un tercero puede llegar dias despues
   * de la jornada, y cuando llega tiene que mover la fecha en la que la formacion vuelve a deberse.
   * Ver la nota larga en `cerrarPorAsistencia`.
   *
   * NO toca el estado ni la fecha de cumplimiento: eso ya paso y no se repite. Solo escribe lo que
   * dice el papel, y lo escribe tambien cuando llega vacio —si alguien borra una fecha que habia
   * tecleado mal, la obligacion tiene que dejar de creersela y volver a lo que calcule la
   * recurrencia—. `validUntilOverride` significa "lo que dice el papel", y sin papel no dice nada.
   *
   * Se busca por `completedEnrollmentId` primero porque es el vinculo exacto —esta inscripcion
   * cerro esa obligacion— y no una coincidencia por persona y formacion, que con varias rondas
   * podria dar con la ronda equivocada.
   */
  /**
   * LA MISMA VIGENCIA, DESDE FUERA DE LA LISTA DE ASISTENCIA (2026-09-08).
   *
   * Publica para la SEGUNDA PUERTA: registrar el papel desde la ficha de la persona
   * (). Es exactamente la misma operacion, y por eso se comparte en
   * vez de copiarse: la primera version de esto se olvido de propagar la vigencia y el papel se
   * guardaba sin mover nada. Escrito dos veces, la segunda repite el olvido.
   */
  async registrarVigenciaDePapel(
    db: TenantPrisma,
    enrollment: { id: string; userId: string; assignmentId: string | null; activityVersion: { activityId: string } },
    validUntil: Date | null,
  ): Promise<void> {
    await this.actualizarVigenciaPorPapel(db, enrollment, validUntil);
  }

  private async actualizarVigenciaPorPapel(
    db: TenantPrisma,
    enrollment: { id: string; userId: string; assignmentId: string | null; activityVersion: { activityId: string } },
    validUntil: Date | null,
  ): Promise<void> {
    const assignment =
      (await db.assignment.findFirst({ where: { completedEnrollmentId: enrollment.id } })) ??
      (enrollment.assignmentId ? await db.assignment.findUnique({ where: { id: enrollment.assignmentId } }) : null);
    if (!assignment) return;
    if (assignment.validUntilOverride?.getTime() === validUntil?.getTime()) return;
    await db.assignment.update({ where: { id: assignment.id }, data: { validUntilOverride: validUntil } });
  }

  private async markStatus(db: TenantPrisma, enrollmentId: string, status: 'IN_PROGRESS' | 'FAILED'): Promise<void> {
    await db.enrollment.update({
      where: { id: enrollmentId },
      data: { status, ...(status === 'IN_PROGRESS' ? { startedAt: new Date() } : {}) },
    });
  }
}
