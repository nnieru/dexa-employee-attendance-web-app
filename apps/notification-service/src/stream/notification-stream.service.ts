import { ACCOUNT_STATUS_READER, type IAccountStatusReader } from '@dexa/common';
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
 * heartbeat comments. It ends when the client leaves, when a heartbeat finds the account inactive (D-13), or when the
 * account check fails, because a stream that cannot be verified must not stay open.
 */
@Injectable()
export class NotificationStreamService implements BeforeApplicationShutdown {
  private readonly logger = new Logger(NotificationStreamService.name);
  private readonly openConnections = new Set<NotificationStreamConnection>();

  constructor(
    @Inject(NOTIFICATION_HUB) private readonly hub: INotificationHub,
    @Inject(ACCOUNT_STATUS_READER) private readonly accountStatuses: IAccountStatusReader,
    @Inject(NOTIFICATION_STREAM_HEARTBEAT) private readonly heartbeatMilliseconds: number,
  ) {}

  attach(recipientAccountId: string, response: Response): void {
    response.writeHead(HTTP_STATUS_OK, EVENT_STREAM_HEADERS);
    response.flushHeaders();
    const connection = new NotificationStreamConnection(response);
    const unsubscribe = this.hub.subscribe(recipientAccountId, (notification) => {
      connection.send(formatNotificationFrame(notification));
    });
    const heartbeat = setInterval(() => {
      void this.beat(recipientAccountId, connection);
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

  private async beat(
    recipientAccountId: string,
    connection: NotificationStreamConnection,
  ): Promise<void> {
    if (connection.isClosed) return;
    const isActive = await this.isAccountActive(recipientAccountId);
    if (!isActive) {
      connection.close();
      return;
    }
    connection.send(HEARTBEAT_FRAME);
  }

  private async isAccountActive(accountId: string): Promise<boolean> {
    try {
      const status = await this.accountStatuses.findAccountStatus(accountId);
      return status?.isActive === true;
    } catch (error: unknown) {
      // Fails closed. The client reconnects, and the gateway refuses the reconnect if the account is inactive.
      const reason = error instanceof Error ? error.name : 'unknown error';
      this.logger.warn(`Closing a notification stream after its account check failed (${reason}).`);
      return false;
    }
  }
}
