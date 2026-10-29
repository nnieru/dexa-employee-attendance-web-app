/**
 * Thrown by a handler when redelivering the same message can never succeed, such as a payload that
 * fails validation. The consumer sends it straight to the dead-letter queue without retrying.
 */
export class NonRetryableMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableMessageError';
  }
}
