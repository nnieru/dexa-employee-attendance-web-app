import { randomUUID } from 'node:crypto';
import {
  buildDeadLetterArchiveRecord,
  readEventId,
  readMessageId,
  type DeadLetterDelivery,
} from './dead-letter-archive.rules.js';

const SOURCE_QUEUE = 'audit.profile-changes';
const OBSERVED_AT = new Date('2026-10-30T02:10:00.000Z');
const EVENT_ID = '0f1d6a8e-4c1b-4a55-9d2e-7b3c2a1f0e9d';
const DEATH_AT = new Date('2026-10-30T02:03:00.000Z');
const FALLBACK_MESSAGE_ID_PATTERN = /^sha256:[0-9a-f]{64}$/;

// The wire form amqplib decodes for an AMQP timestamp: whole seconds since the epoch.
function wireTimestamp(time: Date): { '!': 'timestamp'; value: number } {
  return { '!': 'timestamp', value: Math.floor(time.getTime() / 1000) };
}

function nestEnvelope(data: unknown): Buffer {
  return Buffer.from(JSON.stringify({ pattern: 'employee.profile.updated', data }), 'utf8');
}

function deliveryOf(overrides: Partial<DeadLetterDelivery>): DeadLetterDelivery {
  return {
    content: nestEnvelope({ eventId: EVENT_ID }),
    messageId: EVENT_ID,
    headers: undefined,
    ...overrides,
  };
}

describe('readMessageId', () => {
  it.each([
    { condition: 'the AMQP message ID is a UUID', messageId: EVENT_ID },
    { condition: 'the AMQP message ID has 255 characters', messageId: 'a'.repeat(255) },
  ])('should use the AMQP message ID when $condition', ({ messageId }) => {
    expect(readMessageId(deliveryOf({ messageId }), SOURCE_QUEUE)).toBe(messageId);
  });

  it.each([
    { condition: 'the AMQP message ID is absent', messageId: undefined },
    { condition: 'the AMQP message ID is empty', messageId: '' },
    { condition: 'the AMQP message ID is not a string', messageId: 42 },
    { condition: 'the AMQP message ID has 256 characters', messageId: 'a'.repeat(256) },
  ])('should derive a fallback key when $condition', ({ messageId }) => {
    const key = readMessageId(deliveryOf({ messageId, content: Buffer.from('{}') }), SOURCE_QUEUE);

    expect(key).toMatch(FALLBACK_MESSAGE_ID_PATTERN);
  });

  it('should derive the same fallback key for the same queue and body, and a different one otherwise', () => {
    const body = Buffer.from('{"pattern":"x"}');
    const first = readMessageId(deliveryOf({ messageId: undefined, content: body }), SOURCE_QUEUE);
    const redelivered = readMessageId(
      deliveryOf({ messageId: undefined, content: body }),
      SOURCE_QUEUE,
    );
    const otherBody = readMessageId(
      deliveryOf({ messageId: undefined, content: Buffer.from('{"pattern":"y"}') }),
      SOURCE_QUEUE,
    );
    const otherQueue = readMessageId(
      deliveryOf({ messageId: undefined, content: body }),
      'other.queue',
    );

    expect(redelivered).toBe(first);
    expect(otherBody).not.toBe(first);
    expect(otherQueue).not.toBe(first);
  });
});

describe('readEventId', () => {
  it.each([
    {
      condition: 'the body is a Nest envelope with a valid event ID',
      body: nestEnvelope({ eventId: EVENT_ID }),
      expected: EVENT_ID,
    },
    { condition: 'the body is not JSON', body: Buffer.from('not json{'), expected: null },
    {
      condition: 'the body is JSON without an envelope',
      body: Buffer.from('{"eventId":"' + EVENT_ID + '"}'),
      expected: null,
    },
    {
      condition: 'the envelope data has no event ID',
      body: nestEnvelope({ foo: 'bar' }),
      expected: null,
    },
    {
      condition: 'the event ID is not a UUID',
      body: nestEnvelope({ eventId: 'not-a-uuid' }),
      expected: null,
    },
    { condition: 'the body is not UTF-8', body: Buffer.from([0xff, 0xfe, 0x00]), expected: null },
  ])('should return $expected when $condition', ({ body, expected }) => {
    expect(readEventId(body)).toBe(expected);
  });
});

describe('buildDeadLetterArchiveRecord', () => {
  it('should map an envelope with an x-death entry to a row with the failure facts and the wire headers', () => {
    const record = buildDeadLetterArchiveRecord({
      sourceQueue: SOURCE_QUEUE,
      observedAt: OBSERVED_AT,
      delivery: deliveryOf({
        headers: {
          'x-death': [
            {
              queue: SOURCE_QUEUE,
              reason: 'rejected',
              count: 1,
              time: wireTimestamp(DEATH_AT),
              exchange: 'app.events',
              'routing-keys': ['employee.profile.updated'],
            },
          ],
          'x-custom': 'not archived',
        },
      }),
    });

    expect(record).toEqual({
      messageId: EVENT_ID,
      eventId: EVENT_ID,
      sourceQueue: SOURCE_QUEUE,
      payload: nestEnvelope({ eventId: EVENT_ID }),
      headers: {
        'x-death': [
          {
            queue: SOURCE_QUEUE,
            reason: 'rejected',
            count: 1,
            time: DEATH_AT.toISOString(),
            exchange: 'app.events',
            'routing-keys': ['employee.profile.updated'],
          },
        ],
      },
      attemptCount: 1,
      lastError: 'rejected',
      firstFailedAt: DEATH_AT,
      lastFailedAt: DEATH_AT,
    });
  });

  it.each([
    {
      condition: 'the body is not JSON and no message ID is set',
      delivery: deliveryOf({ messageId: undefined, content: Buffer.from([0xff, 0x00]) }),
    },
    {
      condition: 'the delivery has no headers',
      delivery: deliveryOf({ headers: undefined }),
    },
  ])(
    'should archive the bytes with an empty header map and the observed time when $condition',
    ({ delivery }) => {
      const record = buildDeadLetterArchiveRecord({
        sourceQueue: SOURCE_QUEUE,
        observedAt: OBSERVED_AT,
        delivery,
      });

      expect(record.payload).toBe(delivery.content);
      expect(record.headers).toEqual({});
      expect(record.attemptCount).toBe(1);
      expect(record.firstFailedAt).toBe(OBSERVED_AT);
      expect(record.lastFailedAt).toBe(OBSERVED_AT);
    },
  );

  it('should store no event ID when the body is not an envelope', () => {
    const record = buildDeadLetterArchiveRecord({
      sourceQueue: SOURCE_QUEUE,
      observedAt: OBSERVED_AT,
      delivery: deliveryOf({ messageId: randomUUID(), content: Buffer.from('{"foo":"bar"}') }),
    });

    expect(record.eventId).toBeNull();
  });
});
