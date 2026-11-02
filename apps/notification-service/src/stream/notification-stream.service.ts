import { Inject, Injectable, Logger, type BeforeApplicationShutdown } from '@nestjs/common';
import type { Response } from 'express';
import { NOTIFICATION_HUB, type INotificationHub } from './notification-hub.interface.js';
import { NOTIFICATION_STREAM_HEARTBEAT } from './notification-stream.constants.js';
import { NotificationStreamConnection } from './notification-stream-connection.js';
import { HEARTBEAT_FRAME, formatNotificationFrame } from './sse-frame.rules.js';

const HTTP_STATUS_OK = 200;

// Headers that keep the stream unbuffered and untransformed by proxies. X-Accel-Buffering turns off nginx buffering.
const EVENT_STREAM_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
} as const;

/**
 * Opens the HR notification stream for one recipient. The stream carries the rows committed for that recipient and
 * heartbeat comments. It ends when the client leaves. The account is not checked here: api-gateway checks it while it
 * proxies the stream, and closes the connection when the account is deactivated. The token is checked once, at
 * connect, by the guard on the route.
 */
@Injectable()
export class NotificationStreamService implements BeforeApplicationShutdown {
  private readonly logger = new Logger(NotificationStreamService.name);
  private readonly openConnections = new Set<NotificationStreamConnection>();

  constructor(
    @Inject(NOTIFICATION_HUB) private readonly hub: INotificationHub,
    @Inject(NOTIFICATION_STREAM_HEARTBEAT) private readonly heartbeatMilliseconds: number,
  ) {}

  attach(recipientAccountId: string, response: Response): void {
    response.writeHead(HTTP_STATUS_OK, EVENT_STREAM_HEADERS);
    response.flushHeaders();
    const connection = new NotificationStreamConnection(response);
    const unsubscribe = this.hub.subscribe(recipientAccountId, (notification) => {
      connection.send(formatNotificationFrame(notification));
    });
    // A heartbeat keeps proxies from closing an idle connection. It is sent only while the stream is open,
    // because onClose clears the timer.
    const heartbeat = setInterval(() => {
      connection.send(HEARTBEAT_FRAME);
    }, this.heartbeatMilliseconds);
    this.openConnections.add(connection);
    connection.onClose(() => {
      clearInterval(heartbeat);
      unsubscribe();
      this.openConnections.delete(connection);
    });
  }

  // Nest closes the HTTP server after this hook, and the server waits for every open response. Ending the streams here
  // lets the shutdown finish, instead of waiting for each browser to leave.
  beforeApplicationShutdown(): void {
    for (const connection of [...this.openConnections]) {
      connection.close();
    }
  }
}
