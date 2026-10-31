import { Roles } from '@dexa/common';
import { Role } from '@dexa/contracts';
import {
  BeforeApplicationShutdown,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Inject,
  Logger,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { readBearerToken } from '../auth/read-bearer-token.js';
import { relayEventStream, EVENT_STREAM_HEADERS } from './event-stream.relay.js';
import {
  NOTIFICATION_STREAM_CLIENT,
  type INotificationStreamClient,
} from './notification-stream-client.interface.js';

/**
 * Proxies the HR notification stream (D-08, ADM-5). The global guards verify the token, the account, and the HR role
 * before this handler runs, so an employee is refused without any call to notification-service. The response is
 * written directly because a Nest return value cannot hold an open stream.
 */
@Controller('notifications')
export class NotificationsController implements BeforeApplicationShutdown {
  private readonly logger = new Logger(NotificationsController.name);
  // Each relayed stream holds one controller that aborts it when the browser leaves or the gateway shuts down.
  private readonly openRelays = new Set<AbortController>();

  constructor(
    @Inject(NOTIFICATION_STREAM_CLIENT)
    private readonly notificationStreams: INotificationStreamClient,
  ) {}

  // Nest closes the HTTP server after this hook, and the server waits for every open response. Aborting the relays
  // here ends them, so the shutdown does not wait for each browser to leave.
  beforeApplicationShutdown(): void {
    for (const browserLeft of [...this.openRelays]) {
      browserLeft.abort();
    }
  }

  @Roles(Role.HR)
  @Get('stream')
  async streamNotifications(
    @Headers('authorization') authorization: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const accessToken = readBearerToken(authorization);
    const browserLeft = new AbortController();
    this.openRelays.add(browserLeft);
    response.once('close', () => {
      this.openRelays.delete(browserLeft);
      browserLeft.abort();
    });

    let upstreamBody: ReadableStr eam<Uint8Array>;
    try {
      upstreamBody = await this.notificationStreams.openStream({
        accessToken,
        signal: browserLeft.signal,
      });
    } catch (error: unknown) {
      // The browser left before the upstream answered, so there is nobody to send the error to.
      if (browserLeft.signal.aborted) return;
      throw error;
    }

    response.writeHead(HttpStatus.OK, EVENT_STREAM_HEADERS);
    response.flushHeaders();
    try {
      await relayEventStream(upstreamBody, response);
    } catch (error: unknown) {
      if (browserLeft.signal.aborted) return;
      const reason = error instanceof Error ? error.name : 'unknown error';
      this.logger.warn(`Notification stream ended early (${reason}).`);
    }
  }
}
