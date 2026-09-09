import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../common/audit.service.js';
import type { AuthUser } from '../common/types.js';
import { decidirConvalidacion } from '../certificates/certificate-policy.js';
import { PrismaService } from '../prisma/prisma.service.js';

/*
  EL MOTIVO ES OBLIGATORIO Y LARGO A PROPOSITO.

  Convalidar sustituye la evidencia propia por la de otra empresa. Seis meses despues, cuando un
  auditor pregunte por que esta persona no aparece en ninguna lista de asistencia, la respuesta
  tiene que estar escrita: "trae certificado de alturas de Coordinadora, vigente hasta 2027-08,
  expedido por ARL Sura". Un campo que admite "ok" no es una explicacion.
*/
const convalidarSchema = z.object({
  number: z.string().trim().min(1).max(80),
  issuer: z.string().trim().min(2).max(160),
  /**
   * HASTA CUANDO VALE. Obligatoria aqui, al reves que en la lista de asistencia: alli el papel puede
   * llegar despues y la recurrencia sirve de red mientras tanto. Aqui el papel ES la unica evidencia
   * —no hubo jornada— y sin su fecha no hay nada que diga cuando caduca lo que se esta aceptando.
   */
  validUntil: z.string().date(),
  fileKey: z.string().max(500).optional(),
  reason: z.string().trim().min(15).max(500),
});

@Injectable()
export class ConvalidacionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * LAS OBLIGACIONES DE ALGUIEN QUE SE PUEDEN CONVALIDAR.
   *
   * Solo las ABIERTAS —lo ya cumplido no se convalida— y solo las de formaciones cuyo tipo lo
   * admite. La segunda condicion es la que evita el desastre: sin ella, la lista ofreceria dar por
   * cumplida una induccion con el papel de otra empresa.
   */
  async convalidablesDe(userId: string) {
    const abiertas = await this.prisma.scoped.assignment.findMany({
      where: {
        userId,
        targetType: 'ACTIVITY',
        status: { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE'] },
      },
      select: { id: true, targetId: true, dueAt: true, cycleNumber: true, status: true },
      orderBy: { dueAt: 'asc' },
    });
    if (abiertas.length === 0) return [];

    const actividades = await this.prisma.scoped.activity.findMany({
      where: { id: { in: abiertas.map((a) => a.targetId) } },
      select: {
        id: true,
        name: true,
        admiteConvalidacion: true,
        activityType: { select: { name: true, config: true } },
      },
    });
    const porId = new Map(actividades.map((a) => [a.id, a]));

    return abiertas
      .filter((a) => {
        const actividad = porId.get(a.targetId);
        if (!actividad) return false;
        // La CASCADA, no la columna del tipo a secas: una formacion puede desviarse de su clase.
        return decidirConvalidacion(actividad.activityType ?? null, {
          admiteConvalidacion: actividad.admiteConvalidacion,
        });
      })
      .map((a) => ({
        assignmentId: a.id,
        // Para poder ABRIR la formacion desde la fila (`PENDIENTES` 2.5): quien acepta el papel de
        // otra empresa suele querer ver antes que exige la nuestra.
        actividadId: a.targetId,
        actividad: porId.get(a.targetId)?.name ?? '',
        tipo: porId.get(a.targetId)?.activityType?.name ?? null,
        dueAt: a.dueAt,
        cycleNumber: a.cycleNumber,
        status: a.status,
      }));
  }

  /**
   * ACEPTAR EL PAPEL DE OTRO EMPLEO Y DAR LA OBLIGACION POR CUMPLIDA.
   *
   * Queda COMPLETED —porque lo esta: la formacion se hizo, en otro sitio— con su papel al lado y con
   * el nombre de quien lo acepto. NO queda `WAIVED`: eso le diria al auditor "la dejamos pasar", que
   * es falso y peor.
   */
  async convalidar(actor: AuthUser, assignmentId: string, body: unknown) {
    const input = convalidarSchema.parse(body);

    const asignacion = await this.prisma.scoped.assignment.findUnique({
      where: { id: assignmentId },
      select: { id: true, userId: true, targetId: true, targetType: true, status: true },
    });
    if (!asignacion || asignacion.targetType !== 'ACTIVITY') {
      throw new NotFoundException({ code: 'ASSIGNMENT_NOT_FOUND' });
    }

    // 1. Solo lo abierto. Convalidar algo ya cumplido pisaria una evidencia propia con una ajena.
    if (!['PENDING', 'IN_PROGRESS', 'OVERDUE'].includes(asignacion.status)) {
      throw new ConflictException({
        code: 'ASSIGNMENT_NOT_OPEN',
        message: 'Esta obligación ya no esta abierta, así que no hay nada que convalidar.',
      });
    }

    /*
      2. Y LA FORMACION TIENE QUE ADMITIRLO. Es la compuerta que impide dar por cumplida una
         induccion con el papel de otra empresa. Vive en el servidor y no solo en la lista, por lo
         mismo de siempre: un control que solo existe en el navegador no es un control.
    */
    const actividad = await this.prisma.scoped.activity.findUnique({
      where: { id: asignacion.targetId },
      select: { name: true, admiteConvalidacion: true, activityType: { select: { config: true } } },
    });
    const loAdmite = actividad
      ? decidirConvalidacion(actividad.activityType ?? null, { admiteConvalidacion: actividad.admiteConvalidacion })
      : false;
    if (!loAdmite) {
      throw new ConflictException({
        code: 'ACTIVITY_DOES_NOT_ALLOW_CONVALIDATION',
        message:
          'Esta formación no acepta certificación previa de otra empresa: hay que hacerla aquí. Se cambia en su ficha, o en Configuración → Tipos de formación para toda su clase.',
      });
    }

    /*
      3. Y EL PAPEL TIENE QUE ESTAR VIGENTE HOY. Aceptar uno ya caducado es registrar un
         incumplimiento como cumplimiento: la persona quedaria en verde con una habilitacion que no
         la habilita. Si vencio, lo que toca es convocarla.
    */
    const validUntil = new Date(`${input.validUntil}T23:59:59-05:00`);
    if (validUntil < new Date()) {
      throw new ConflictException({
        code: 'CERT_ALREADY_EXPIRED',
        message: 'Ese certificado ya venció, así que no acredita nada. Hay que convocarla a la formación.',
      });
    }

    const ahora = new Date();
    await this.prisma.scoped.assignment.update({
      where: { id: assignmentId },
      data: {
        status: 'COMPLETED',
        completedAt: ahora,
        // Sin `completedEnrollmentId`: no hubo ejecucion en esta empresa, y enlazar una inventada
        // seria falsear el rastro que el auditor sigue.
        extCertIssuer: input.issuer,
        extCertNumber: input.number,
        extCertFileKey: input.fileKey ?? null,
        // La vigencia va donde ya vivia: el motor la lee de aqui para la ronda siguiente.
        validUntilOverride: validUntil,
        convalidatedBy: actor.id,
        convalidatedReason: input.reason,
      },
    });

    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: 'ASSIGNMENT_CONVALIDATED',
      resourceType: 'assignments',
      resourceId: assignmentId,
      newValues: {
        actividad: actividad?.name ?? null,
        issuer: input.issuer,
        number: input.number,
        validUntil: input.validUntil,
        reason: input.reason,
      },
    });

    return { ok: true, validUntil: validUntil.toISOString() };
  }
}
