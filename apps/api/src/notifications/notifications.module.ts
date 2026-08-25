import { Global, Module } from '@nestjs/common';
import { EmailDispatcher } from './email.dispatcher.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

/** Global: cualquier modulo de dominio encola notificaciones sin importar el modulo. */
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, EmailDispatcher],
  exports: [NotificationsService],
})
export class NotificationsModule {}
