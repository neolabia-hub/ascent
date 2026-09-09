import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ReportsModule } from '../reports/reports.module.js';
import { ExpirationDigestWorker } from './expiration-digest.worker.js';
import { NotificationRetentionWorker } from './notification-retention.worker.js';
import { PerformanceReminderWorker } from './performance-reminder.worker.js';
import { PillNudgeWorker } from './pill-nudge.worker.js';
import { RequirementWorker } from './requirement.worker.js';

/** Trabajos programados del sistema. El motor de requisitos llega por AssignmentsModule (global). */
@Module({
  imports: [NotificationsModule, ReportsModule],
  providers: [
    RequirementWorker,
    PillNudgeWorker,
    NotificationRetentionWorker,
    PerformanceReminderWorker,
    ExpirationDigestWorker,
  ],
})
export class WorkersModule {}
