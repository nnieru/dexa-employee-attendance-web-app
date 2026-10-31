import { Module } from '@nestjs/common';
import { NotificationInboxController } from './notification-inbox.controller.js';
import { NotificationInboxRepository } from './notification-inbox.repository.js';
import { NOTIFICATION_INBOX_REPOSITORY } from './notification-inbox.repository.interface.js';
import { NotificationInboxService } from './notification-inbox.service.js';
import { NOTIFICATION_INBOX_SERVICE } from './notification-inbox.service.interface.js';

// DATABASE and CLOCK are global, so the repository and service inject them without importing their modules.
@Module({
  controllers: [NotificationInboxController],
  providers: [
    { provide: NOTIFICATION_INBOX_SERVICE, useClass: NotificationInboxService },
    { provide: NOTIFICATION_INBOX_REPOSITORY, useClass: NotificationInboxRepository },
  ],
})
export class NotificationInboxModule {}
