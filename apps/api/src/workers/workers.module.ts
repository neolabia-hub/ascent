import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { NotificationRetentionWorker } from './notification-retention.worker.js';
import { PillNudgeWorker } from './pill-nudge.worker.js';
import { RequirementWorker } from './requirement.worker.js';

/** Trabajos programados del sistema. El motor de requisitos llega por AssignmentsModule (global). */
@Module({
  imports: [NotificationsModule],
  providers: [RequirementWorker, PillNudgeWorker, NotificationRetentionWorker],
})
export class WorkersModule {}
