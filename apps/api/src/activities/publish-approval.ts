import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ApprovalsService } from '../approvals/approvals.service.js';
import { VersioningService } from './versioning.service.js';

/** Tipos de entidad que el flujo de aprobacion sabe aplicar. */
export const APPROVAL_ENTITY_ACTIVITY_VERSION = 'activity_version';

interface PublishPayload {
  migrationPolicy?: 'FINISH_OLD' | 'RESTART_NEW' | 'MOVE_NOT_STARTED';
}

/**
 * Conecta el flujo de aprobaciones con el motor de versionado (negocio 3.3).
 *
 * Sin esto, aprobar una solicitud solo cambiaba su estado y el cambio nunca ocurria: el analista
 * quedaba esperando algo que no pasaba. Aqui se registra QUIEN sabe ejecutar cada tipo de
 * solicitud, y `ApprovalsService.decide` lo invoca al aprobar (si el applier falla, la solicitud
 * NO queda aprobada).
 */
@Injectable()
export class PublishApprovalRegistrar implements OnModuleInit {
  constructor(
    private readonly approvals: ApprovalsService,
    private readonly versioning: VersioningService,
  ) {}

  onModuleInit(): void {
    this.approvals.registerApplier(APPROVAL_ENTITY_ACTIVITY_VERSION, async (payload, entityId, approver) => {
      const { migrationPolicy = 'MOVE_NOT_STARTED' } = payload as PublishPayload;
      // El aprobador es quien publica de verdad: queda en la auditoria a su nombre, que es lo
      // que corresponde porque es quien tiene la responsabilidad del contenido publicado.
      await this.versioning.publish(approver, entityId, { migrationPolicy, confirm: true });
    });
  }
}
