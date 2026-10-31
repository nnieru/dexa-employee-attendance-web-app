import { Module, type DynamicModule } from '@nestjs/common';
import { NotificationInboxClient } from './notification-inbox.client.js';
import { NOTIFICATION_INBOX_CLIENT } from './notification-inbox-client.interface.js';
import { NotificationInboxController } from './notification-inbox.controller.js';
import { NotificationStreamClient } from './notification-stream.client.js';
import {
  NOTIFICATION_SERVICE_BASE_URL,
  NOTIFICATION_STREAM_ACCOUNT_CHECK_MILLISECONDS,
  NOTIFICATION_STREAM_CLIENT,
  NOTIFICATION_STREAM_CONNECT_TIMEOUT,
} from './notification-stream-client.interface.js';
import { NotificationsController } from './notifications.controller.js';

// Bounds only the wait for the stream's headers. A stream that is open has no deadline; heartbeats keep it alive.
const CONNECT_TIMEOUT_MILLISECONDS = 3_000;
// Matches notification-service's heartbeat, so a deactivated account loses its stream within one heartbeat.
const ACCOUNT_CHECK_MILLISECONDS = 15_000;

export type GatewayNotificationsModuleOptions = {
  readonly notificationServiceBaseUrl: string;
};

@Module({})
export class GatewayNotificationsModule {
  // The base URL comes from the validated config, which createAppModule holds, so it is passed in as a value.
  static forRoot(options: GatewayNotificationsModuleOptions): DynamicModule {
    return {
      module: GatewayNotificationsModule,
      controllers: [NotificationsController, NotificationInboxController],
      providers: [
        { provide: NOTIFICATION_SERVICE_BASE_URL, useValue: options.notificationServiceBaseUrl },
        {
          provide: NOTIFICATION_STREAM_CONNECT_TIMEOUT,
          useValue: CONNECT_TIMEOUT_MILLISECONDS,
        },
        {
          provide: NOTIFICATION_STREAM_ACCOUNT_CHECK_MILLISECONDS,
          useValue: ACCOUNT_CHECK_MILLISECONDS,
        },
        { provide: NOTIFICATION_STREAM_CLIENT, useClass: NotificationStreamClient },
        { provide: NOTIFICATION_INBOX_CLIENT, useClass: NotificationInboxClient },
      ],
    };
  }
}
