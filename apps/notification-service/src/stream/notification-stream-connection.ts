import { Logger } from '@nestjs/common';
import type { Response } from 'express';

/**
 * One open server-sent event response. It writes frames while it is open, and it closes once: when the client leaves,
 * when the response fails, or when the service ends it. Close listeners run once, so each stream releases what it
 * holds (its subscription and its heartbeat timer) exactly once.
 */
export class NotificationStreamConnection {
  private readonly logger = new Logger(NotificationStreamConnection.name);
  private isOpen = true;
  private readonly closeListeners: Array<() => void> = [];

  constructor(private readonly response: Response) {
    response.once('close', () => this.close());
    // A failed socket ends the stream. The client reconnects, and the inbox covers what it missed.
    // on, not once: a second error on the response must not reach Node as an unhandled event.
    response.on('error', (error: Error) => {
      this.logger.warn(`Closing a notification stream after a socket error (${error.name}).`);
      this.close();
    });
  }

  get isClosed(): boolean {
    return !this.isOpen;
  }

  send(frame: string): void {
    if (!this.isOpen || this.response.destroyed || this.response.writableEnded) return;
    this.response.write(frame);
  }

  onClose(listener: () => void): void {
    this.closeListeners.push(listener);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    for (const listener of this.closeListeners) {
      listener();
    }
    this.response.end();
  }
}
