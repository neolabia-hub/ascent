import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { ApprovalStatus } from '@prisma/client';
import type { CreateApprovalInput, DecideApprovalInput, PermissionCode } from '@neo-pulse/shared';
import { AuditService } from '../common/audit.service.js';
import type { AuthUser } from '../common/types.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Aplicador de un cambio aprobado. Cada modulo de dominio registra el suyo (Sprint 2+: publicar
 * actividad, editar publicado, cancelar convocatoria). El cambio se APLICA solo al aprobar; el
 * payload es la propuesta completa. Si no hay applier para el entityType, la aprobacion queda
 * registrada y el solicitante la ejecuta manualmente (transicion mientras se cablean los flujos).
 */
export type ApprovalApplier = (payload: Record<string, unknown>, entityId: string, approver: AuthUser) => Promise<void>;

@Injectable()
export class ApprovalsService {
  private readonly appliers = new Map<string, ApprovalApplier>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Registro de appliers por entityType (lo llaman los modulos de dominio al iniciar). */
  registerApplier(entityType: string, applier: ApprovalApplier): void {
    this.appliers.set(entityType, applier);
  }

  /**
   * COMPUERTA reutilizable del flujo Analista (negocio 3.3): si el actor tiene el permiso que
   * habilita la accion, la ejecuta directo; si no, crea la solicitud con justificacion y
   * notifica a quienes deciden. Devuelve que camino tomo, para que la UI diga la verdad
   * ("publicado" o "enviado a aprobacion") en vez de dar un 403 seco.
   */
  async requestOrExecute(
    actor: AuthUser,
    requiredPermission: PermissionCode,
    input: CreateApprovalInput,
    execute: () => Promise<void>,
  ): Promise<{ executed: boolean; approvalId?: string }> {
    if (actor.hasPermission(requiredPermission)) {
      await execute();
      return { executed: true };
    }
    const approval = await this.create(actor, input);
    return { executed: false, approvalId: approval.id };
  }

  async create(actor: AuthUser, input: CreateApprovalInput) {
    const tenantId = this.prisma.currentTenantId;
    const approval = await this.prisma.scoped.approvalRequest.create({
      data: {
        tenantId,
        requestedBy: actor.id,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        payload: input.payload as object,
        justification: input.justification,
      },
    });

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'APPROVAL_REQUESTED',
      resourceType: 'approval_requests',
      resourceId: approval.id,
      newValues: { entityType: input.entityType, action: input.action, justification: input.justification },
    });
    await this.notifications.notifyByPermission(tenantId, 'approvals:decide', {
      eventType: 'APPROVAL_REQUESTED',
      subject: 'Nueva solicitud de aprobacion',
      body: `${actor.email} solicita aprobacion (${input.action}) sobre ${input.entityType}. Justificacion: ${input.justification}`,
      referenceType: 'approval_requests',
      referenceId: approval.id,
    });
    return approval;
  }

  async list(status: ApprovalStatus | undefined, page: number, pageSize: number) {
    const where = status ? { status } : {};
    const [total, items] = await Promise.all([
      this.prisma.scoped.approvalRequest.count({ where }),
      this.prisma.scoped.approvalRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    // Nombres de solicitantes/decisores en un viaje.
    const userIds = [...new Set(items.flatMap((i) => [i.requestedBy, i.decidedBy].filter((v): v is string => Boolean(v))))];
    const users = await this.prisma.scoped.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true },
    });
    const nameById = new Map(users.map((u) => [u.id, u.fullName]));
    return {
      total,
      page,
      pageSize,
      items: items.map((i) => ({
        ...i,
        requestedByName: nameById.get(i.requestedBy) ?? null,
        decidedByName: i.decidedBy ? (nameById.get(i.decidedBy) ?? null) : null,
      })),
    };
  }

  /** Mis solicitudes (el analista sigue el estado de lo suyo). */
  async mine(actor: AuthUser, page: number, pageSize: number) {
    const where = { requestedBy: actor.id };
    const [total, items] = await Promise.all([
      this.prisma.scoped.approvalRequest.count({ where }),
      this.prisma.scoped.approvalRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async decide(approver: AuthUser, id: string, input: DecideApprovalInput) {
    const tenantId = this.prisma.currentTenantId;
    const approval = await this.prisma.scoped.approvalRequest.findUnique({ where: { id } });
    if (!approval) throw new NotFoundException({ code: 'APPROVAL_NOT_FOUND' });
    if (approval.status !== 'PENDING') throw new ConflictException({ code: 'APPROVAL_ALREADY_DECIDED', status: approval.status });

    // El cambio se APLICA solo al aprobar (negocio 3.3). Applier primero: si falla, la solicitud
    // sigue PENDING y el error llega al admin — nunca queda "aprobado sin aplicar".
    if (input.decision === 'APPROVED') {
      const applier = this.appliers.get(approval.entityType);
      if (applier) {
        await applier(approval.payload as Record<string, unknown>, approval.entityId, approver);
      }
    }

    const updated = await this.prisma.scoped.approvalRequest.update({
      where: { id },
      data: { status: input.decision, decidedBy: approver.id, decidedAt: new Date(), decisionNote: input.decisionNote ?? null },
    });

    await this.audit.record({
      tenantId,
      userId: approver.id,
      action: input.decision === 'APPROVED' ? 'APPROVAL_APPROVED' : 'APPROVAL_REJECTED',
      resourceType: 'approval_requests',
      resourceId: id,
      oldValues: { status: 'PENDING' },
      newValues: { status: input.decision, decisionNote: input.decisionNote },
    });

    const requester = await this.prisma.scoped.user.findUnique({
      where: { id: approval.requestedBy },
      select: { id: true, email: true },
    });
    if (requester) {
      await this.notifications.notify(tenantId, {
        eventType: input.decision === 'APPROVED' ? 'APPROVAL_APPROVED' : 'APPROVAL_REJECTED',
        recipientUserId: requester.id,
        recipientEmail: requester.email,
        subject: input.decision === 'APPROVED' ? 'Tu solicitud fue aprobada' : 'Tu solicitud fue rechazada',
        body: `Solicitud sobre ${approval.entityType} (${approval.action}): ${input.decision === 'APPROVED' ? 'APROBADA' : 'RECHAZADA'}.${input.decisionNote ? ` Nota: ${input.decisionNote}` : ''}`,
        referenceType: 'approval_requests',
        referenceId: id,
      });
    }
    return updated;
  }
}
