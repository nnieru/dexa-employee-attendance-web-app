import { Module, type DynamicModule } from '@nestjs/common';
import { NotificationStreamClient } from './notification-stream.client.js';
import {
  NOTIFICATION_SERVICE_BASE_URL,
  NOTIFICATION_STREAM_CLIENT,
  NOTIFICATION_STREAM_CONNECT_TIMEOUT,
} from './notification-stream-client.interface.js';
import { NotificationsController } from './notifications.controller.js';

// Bounds only the wait for the stream's headers. A stream that is open has no deadline; heartbeats keep it alive.
const CONNECT_TIMEOUT_MILLISECONDS = 3_000;

export type GatewayNotificationsModuleOptions = {
  readonly notificationServiceBaseUrl: string;
};

@Module({})
export class GatewayNotificationsModule {
  // The base URL comes from the validated config, which createAppModule holds, so it is passed in as a value.
  static forRoot(options: GatewayNotificationsModuleOptions): DynamicModule {
    return {
      module: GatewayNotificationsModule,
      controllers: [NotificationsController],
      providers: [
        { provide: NOTIFICATION_SERVICE_BASE_URL, useValue: options.notificationServiceBaseUrl },
        {
          provide: NOTIFICATION_STREAM_CONNECT_TIMEOUT,
          useValue: CONNECT_TIMEOUT_MILLISECONDS,
        },
        { provide: NOTIFICATION_STREAM_CLIENT, useClass: NotificationStreamClient },
      ],
    };
  }
}
