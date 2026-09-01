import { Module } from '@nestjs/common';
import { AuditService } from '../common/audit.service.js';
import { StorageModule } from '../storage/storage.module.js';
import { SequenceService } from '../common/sequence.service.js';
import { CertificatesController } from './certificates.controller.js';
import { CertificateRenderService } from './certificate-render.service.js';
import { CertificateTemplatesService } from './certificate-templates.service.js';
import { CertificatesService } from './certificates.service.js';

/**
 * Constancias (Sprint 5). Se exporta el servicio porque quien las emite NO es una pantalla sino el
 * cierre de una ejecucion (`CompletionService`): nacen solas al terminar, no cuando alguien se
 * acuerda de pulsar un boton.
 */
@Module({
  imports: [StorageModule],
  controllers: [CertificatesController],
  providers: [CertificatesService, CertificateTemplatesService, CertificateRenderService, SequenceService, AuditService],
  exports: [CertificatesService],
})
export class CertificatesModule {}
