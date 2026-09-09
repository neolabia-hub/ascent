import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../common/audit.service.js';
import type { AuthUser } from '../common/types.js';
import { CompletionService } from '../learning/completion.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  decidirCertificadoExterno,
  laDictaUnTercero,
  origenDelCertificadoExterno,
} from '../certificates/certificate-policy.js';

/*
  LO QUE SE PUEDE MANDAR. Mismo contrato que dentro de la lista de asistencia, para que el papel se
  registre igual se entre por donde se entre: numero obligatorio —un certificado sin numero no se
  puede rastrear— y el resto opcional.

  `null` en `fileKey` y `validUntil` significa QUITAR, y no "no tocar": desde esta pantalla se
  corrigen errores, y no poder borrar una fecha mal tecleada obligaria a volver a la convocatoria,
  que es justo lo que esto viene a evitar.
*/
const papelSchema = z.object({
  number: z.string().trim().min(1).max(80),
  issuer: z.string().trim().min(2).max(160).optional(),
  validUntil: z.string().date().nullable().optional(),
  fileKey: z.string().max(500).nullable().optional(),
});

@Injectable()
export class PapelDeTerceroService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly completion: CompletionService,
    private readonly audit: AuditService,
  ) {}

  /**
   * LAS FORMACIONES DE ALGUIEN QUE LLEVAN PAPEL DE UN TERCERO.
   *
   * Se filtra en memoria y no en la consulta porque la respuesta NO esta en una columna: sale de la
   * cascada tipo -> ficha (`decidirCertificadoExterno`, Decision #111). Meterla en el `where` como
   * `activity.tracksExternalCertificate = true` se dejaria fuera todas las que lo heredan del tipo
   * sin decirlo en su ficha, que son la mayoria.
   */
  async deLaPersona(userId: string) {
    const filas = await this.prisma.scoped.enrollment.findMany({
      where: {
        userId,
        // Solo lo CERRADO: el papel acredita algo que ya paso. A quien todavia la debe no se le
        // registra un certificado, se le convoca.
        status: { in: ['COMPLETED', 'PASSED'] },
      },
      select: {
        id: true,
        completedAt: true,
        extCertIssuer: true,
        extCertNumber: true,
        extCertValidUntil: true,
        extCertFileKey: true,
        offering: {
          select: {
            id: true,
            code: true,
            scheduledDate: true,
            executedBy: true,
            executedByOther: true,
          },
        },
        activityVersion: {
          select: {
            versionNumber: true,
            activity: {
              select: {
                id: true,
                name: true,
                tracksExternalCertificate: true,
                activityType: { select: { name: true, config: true } },
              },
            },
          },
        },
      },
      orderBy: { completedAt: 'desc' },
    });

    return filas
      .filter((fila) =>
        decidirCertificadoExterno(fila.activityVersion.activity.activityType ?? null, {
          tracksExternalCertificate: fila.activityVersion.activity.tracksExternalCertificate,
        }),
      )
      .map((fila) => ({
        enrollmentId: fila.id,
        completedAt: fila.completedAt,
        actividadId: fila.activityVersion.activity.id,
        actividad: fila.activityVersion.activity.name,
        tipo: fila.activityVersion.activity.activityType?.name ?? null,
        convocatoria: fila.offering
          ? { id: fila.offering.id, code: fila.offering.code, scheduledDate: fila.offering.scheduledDate }
          : null,
        /** Quien la dicto: el emisor por defecto, igual que en la lista. */
        quienLaDicto: fila.offering?.executedByOther ?? fila.offering?.executedBy ?? null,
        /*
          LOS DOS DATOS QUE LA PANTALLA NO PODIA ENSEÑAR (`PENDIENTES` 2.5).

          `origen` dice QUIEN PIDE el papel —la ficha de la formacion o su tipo—, que es lo que
          contesta la pregunta "¿y esta por que sale aqui?" sin abrir cuatro pantallas, y ademas dice
          donde se cambia. `laDictaUnTercero` es el criterio de la lista de asistencia, ahora
          importado del mismo sitio en vez de copiado: con `PROPIOS` no hay tercero que expida nada,
          asi que la pantalla no pide el numero por defecto — pero NO es una compuerta, y por eso
          viaja como dato y no como filtro.
        */
        origen: origenDelCertificadoExterno({
          tracksExternalCertificate: fila.activityVersion.activity.tracksExternalCertificate,
        }),
        laDictaUnTercero: laDictaUnTercero(fila.offering?.executedBy),
        number: fila.extCertNumber,
        issuer: fila.extCertIssuer,
        validUntil: fila.extCertValidUntil,
        fileKey: fila.extCertFileKey,
      }));
  }

  /**
   * REGISTRAR O CORREGIR EL PAPEL DE UNA INSCRIPCION.
   *
   * No toca el estado, ni la fecha de cumplimiento, ni el acta. Solo el papel — y la vigencia de la
   * obligacion, que es lo unico que el papel MANDA (Decision #157).
   */
  async guardar(actor: AuthUser, enrollmentId: string, body: unknown) {
    const input = papelSchema.parse(body);

    const enrollment = await this.prisma.scoped.enrollment.findUnique({
      where: { id: enrollmentId },
      select: {
        id: true,
        userId: true,
        status: true,
        completedAt: true,
        assignmentId: true,
        activityVersionId: true,
        offering: { select: { executedBy: true, executedByOther: true } },
        activityVersion: {
          select: {
            activityId: true,
            activity: {
              select: { tracksExternalCertificate: true, activityType: { select: { config: true } } },
            },
          },
        },
      },
    });
    if (!enrollment) throw new NotFoundException({ code: 'ENROLLMENT_NOT_FOUND' });

    /*
      LAS TRES COMPUERTAS, y las tres viven en el servidor porque las tres se pueden saltar desde
      fuera de la pantalla.
    */

    // 1. La formacion tiene que llevar papel. Misma cascada que en la lista.
    const loLleva = decidirCertificadoExterno(enrollment.activityVersion.activity.activityType ?? null, {
      tracksExternalCertificate: enrollment.activityVersion.activity.tracksExternalCertificate,
    });
    if (!loLleva) {
      throw new ConflictException({
        code: 'TYPE_DOES_NOT_TRACK_EXTERNAL_CERT',
        message:
          'Esta formación no lleva certificado de un tercero. Se cambia en su ficha, o en Configuración → Tipos de formación para toda su clase.',
      });
    }

    // 2. Tiene que estar cerrada. El papel acredita algo que ya paso.
    const cerrada = enrollment.status === 'COMPLETED' || enrollment.status === 'PASSED';
    if (!cerrada) {
      throw new ConflictException({
        code: 'ENROLLMENT_NOT_CLOSED',
        message: 'Todavía no consta que la haya hecho. Primero se cierra su formación, y después se registra el papel.',
      });
    }

    /*
      3. Y NO PUEDE VENCER ANTES DE HABERSE CUMPLIDO. Es la misma compuerta que la de la lista
         —donde se compara con el dia de la jornada— trasladada a lo que aqui se tiene: la fecha de
         cumplimiento. Un papel que caduca antes de existir es siempre un año mal tecleado, y entra
         a la base como una habilitacion vencida que el informe saca en rojo sin explicacion.
    */
    const validUntil = input.validUntil ? new Date(`${input.validUntil}T23:59:59-05:00`) : null;
    if (validUntil && enrollment.completedAt && validUntil < enrollment.completedAt) {
      throw new ConflictException({
        code: 'CERT_EXPIRES_BEFORE_COMPLETION',
        message: 'El certificado vence antes del día en que se cumplió la formación. Revisa el año.',
      });
    }

    const antes = await this.prisma.scoped.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { extCertNumber: true, extCertIssuer: true, extCertValidUntil: true, extCertFileKey: true },
    });

    await this.prisma.scoped.enrollment.update({
      where: { id: enrollmentId },
      data: {
        extCertNumber: input.number,
        // El emisor sale de quien dicto la jornada si no lo mandan, igual que en la lista: es un
        // dato que el sistema ya tiene y teclearlo por cabeza es copiarlo mal tarde o temprano.
        extCertIssuer: input.issuer ?? enrollment.offering?.executedByOther ?? enrollment.offering?.executedBy ?? null,
        extCertValidUntil: validUntil,
        ...(input.fileKey !== undefined ? { extCertFileKey: input.fileKey } : {}),
      },
    });

    /*
      Y LA VIGENCIA A LA OBLIGACION, que es la mitad que se olvido la primera vez (ver la nota de
      `actualizarVigenciaPorPapel`). Sin esto el papel se guardaria y no moveria nada: ni la ronda
      siguiente ni el informe de Vencimientos.
    */
    await this.completion.registrarVigenciaDePapel(this.prisma.scoped, enrollment, validUntil);

    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: 'ENROLLMENT_EXTERNAL_CERT_SET',
      resourceType: 'enrollments',
      resourceId: enrollmentId,
      oldValues: antes ?? undefined,
      newValues: { number: input.number, validUntil: input.validUntil ?? null, fileKey: input.fileKey ?? null },
    });

    return { ok: true };
  }
}
