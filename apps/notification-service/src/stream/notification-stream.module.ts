import { Module } from '@nestjs/common';
import { NOTIFICATION_PUBLISHER } from '../ingestion/notification-publisher.interface.js';
import { NOTIFICATION_HUB } from './notification-hub.interface.js';
import { NotificationHub } from './notification-hub.js';
import {
  NOTIFICATION_STREAM_HEARTBEAT,
  NOTIFICATION_STREAM_HEARTBEAT_MILLISECONDS,
} from './notification-stream.constants.js';
import { NotificationStreamController } from './notification-stream.controller.js';
import { NotificationStreamService } from './notification-stream.service.js';

// The hub is one instance. Ingestion gets it as its publisher, and the stream endpoint gets it as its subscriber, so
// each side depends only on its own port.
@Module({
  controllers: [NotificationStreamController],
  providers: [
    NotificationHub,
    { provide: NOTIFICATION_HUB, useExisting: NotificationHub },
    { provide: NOTIFICATION_PUBLISHER, useExisting: NotificationHub },
    {
      provide: NOTIFICATION_STREAM_HEARTBEAT,
      useValue: NOTIFICATION_STREAM_HEARTBEAT_MILLISECONDS,
    },
    NotificationStreamService,
  ],
  exports: [NOTIFICATION_PUBLISHER],
})
export class NotificationStreamModule {}
