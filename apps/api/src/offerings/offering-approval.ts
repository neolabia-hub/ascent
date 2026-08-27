import { Injectable, type OnModuleInit } from '@nestjs/common';
import { cancelOfferingSchema, publishOfferingSchema } from '@neo-pulse/shared';
import { ApprovalsService } from '../approvals/approvals.service.js';
import { OfferingsService } from './offerings.service.js';

/** Tipo de entidad que el flujo de aprobacion sabe aplicar sobre convocatorias. */
export const APPROVAL_ENTITY_OFFERING = 'offering';

/**
 * Publicar y cancelar una convocatoria son actos con consecuencias hacia fuera: congelan el
 * indicador de cobertura o desconvocan a gente citada. El Analista los propone con
 * justificacion y el Admin decide; al aprobar, esto los EJECUTA de verdad.
 *
 * El payload lleva que hacer, de modo que ambas acciones comparten un solo tipo de entidad.
 */
@Injectable()
export class OfferingApprovalRegistrar implements OnModuleInit {
  constructor(
    private readonly approvals: ApprovalsService,
    private readonly offerings: OfferingsService,
  ) {}

  onModuleInit(): void {
    this.approvals.registerApplier(APPROVAL_ENTITY_OFFERING, async (payload, entityId, approver) => {
      const intent = (payload as { intent?: unknown }).intent;
      if (intent === 'CANCEL') {
        await this.offerings.cancel(approver, entityId, cancelOfferingSchema.parse(payload));
        return;
      }
      await this.offerings.publish(approver, entityId, publishOfferingSchema.parse({ ...payload, confirm: true }));
    });
  }
}
