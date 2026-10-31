import { Module } from '@nestjs/common';
import { AUTH_CLIENT } from './auth-client.interface.js';
import { AuthClient } from './auth.client.js';
import { EMPLOYEE_CLIENT } from './employee-client.interface.js';
import { EmployeeClient } from './employee.client.js';
import { NotificationEventController } from './notification-event.controller.js';
import { NotificationIngestionService } from './notification-ingestion.service.js';
import { NotificationRepository } from './notification.repository.js';
import { NOTIFICATION_WRITER } from './notification-writer.interface.js';
import { NotificationStreamModule } from '../stream/notification-stream.module.js';

@Module({
  imports: [NotificationStreamModule],
  controllers: [NotificationEventController],
  providers: [
    NotificationIngestionService,
    { provide: NOTIFICATION_WRITER, useClass: NotificationRepository },
    { provide: AUTH_CLIENT, useClass: AuthClient },
    { provide: EMPLOYEE_CLIENT, useClass: EmployeeClient },
  ],
})
export class IngestionModule {}
