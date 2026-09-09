import { Module } from '@nestjs/common';
import { LearningModule } from '../learning/learning.module.js';
import { AuditService } from '../common/audit.service.js';
import { SequenceService } from '../common/sequence.service.js';
import { ActaDeSesionService } from './acta-de-sesion.service.js';
import { AsistenciaEnSalaController } from './asistencia-en-sala.controller.js';
import { AsistenciaEnSalaService } from './asistencia-en-sala.service.js';
import { OfferingApprovalRegistrar } from './offering-approval.js';
import { OfferingsController } from './offerings.controller.js';
import { PapelDeTerceroController } from './papel-de-tercero.controller.js';
import { PapelDeTerceroService } from './papel-de-tercero.service.js';
import { OfferingsService } from './offerings.service.js';
import { ProjectedAudienceService } from './projected-audience.service.js';

@Module({
  // `CompletionService` vive en LearningModule y se exporta justo para esto: cerrar una jornada
  // por ASISTENCIA tambien da por cumplida una formacion (Decision #157). No hay ciclo —
  // LearningModule solo importa CertificatesModule.
  imports: [LearningModule],
  controllers: [OfferingsController, PapelDeTerceroController, AsistenciaEnSalaController],
  // OfferingApprovalRegistrar se instancia para registrar el applier: sin el, aprobar la
  // publicacion de una convocatoria no publicaria nada.
  providers: [
    OfferingsService,
    ProjectedAudienceService,
    PapelDeTerceroService,
    AsistenciaEnSalaService,
    ActaDeSesionService,
    OfferingApprovalRegistrar,
    SequenceService,
    AuditService,
  ],
  exports: [OfferingsService, ProjectedAudienceService],
})
export class OfferingsModule {}
