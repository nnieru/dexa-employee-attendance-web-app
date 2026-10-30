import { LAST_ERROR_MAX_LENGTH, sanitizeLastError } from './sanitize-last-error.js';

const BROKER_PASSWORD = 'broker-secret-4c1e';
const BROKER_HOST = 'rabbitmq.internal';

describe('sanitizeLastError', () => {
  it('should keep the error name and message when the message holds no URL', () => {
    expect(sanitizeLastError(new TypeError('boom'))).toBe('TypeError: boom');
  });

  it('should remove the broker URL, its password, and its host when the message names the broker', () => {
    const error = new Error(
      `connect failed for amqp://publisher:${BROKER_PASSWORD}@${BROKER_HOST}:5672/events`,
    );

    const sanitized = sanitizeLastError(error);

    expect(sanitized).toBe('Error: connect failed for <redacted url>');
    expect(sanitized).not.toContain(BROKER_PASSWORD);
    expect(sanitized).not.toContain(BROKER_HOST);
  });

  it('should keep the cause without its URL when the error wraps a network failure', () => {
    const cause = new Error(`connect ECONNREFUSED amqp://publisher:${BROKER_PASSWORD}@127.0.0.1:1`);
    const error = new Error('Event 123 was not confirmed by the broker', { cause });

    expect(sanitizeLastError(error)).toBe(
      'Error: Event 123 was not confirmed by the broker (caused by Error: connect ECONNREFUSED <redacted url>)',
    );
  });

  it('should collapse line breaks so the stored text stays on one line when the message spans lines', () => {
    expect(sanitizeLastError(new Error('first line\nsecond line'))).toBe(
      'Error: first line second line',
    );
  });

  it('should keep a message exactly at the length limit unchanged when it fits', () => {
    const message = 'x'.repeat(LAST_ERROR_MAX_LENGTH - 'Error: '.length);

    expect(sanitizeLastError(new Error(message))).toBe(`Error: ${message}`);
  });

  it('should truncate and end with an ellipsis when the message exceeds the length limit', () => {
    const sanitized = sanitizeLastError(new Error('x'.repeat(2 * LAST_ERROR_MAX_LENGTH)));

    expect(Array.from(sanitized)).toHaveLength(LAST_ERROR_MAX_LENGTH);
    expect(sanitized.endsWith('…')).toBe(true);
  });

  it('should store a generic description and no thrown text when the thrown value is not an Error', () => {
    expect(sanitizeLastError(`amqp://publisher:${BROKER_PASSWORD}@${BROKER_HOST}`)).toBe(
      'unknown error',
    );
  });
});
