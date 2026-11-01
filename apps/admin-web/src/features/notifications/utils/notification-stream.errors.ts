/**
 * Thrown for a 401 or 403 answer. fetch-event-source stops retrying when onerror throws, so this error ends the stream.
 */
export class NotificationStreamRefusedError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Notification stream refused with status ${status}.`);
    this.name = 'NotificationStreamRefusedError';
    this.status = status;
  }
}
