import { Module } from '@nestjs/common';
import { AuditService } from '../common/audit.service.js';
import { OfferingsModule } from '../offerings/offerings.module.js';
import { PlansController } from './plans.controller.js';
import { PlansService } from './plans.service.js';

@Module({
  // El plan reutiliza la derivacion de proyectados de las convocatorias: una sola definicion de
  // "a quienes obliga esta formacion" para el indicador y para las obligaciones que crea.
  imports: [OfferingsModule],
  controllers: [PlansController],
  providers: [PlansService, AuditService],
})
export class PlansModule {}
