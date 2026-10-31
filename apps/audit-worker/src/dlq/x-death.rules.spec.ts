import { readDeathRecords, summarizeFailures, type DeathRecord } from './x-death.rules.js';

const SOURCE_QUEUE = 'audit.profile-changes';
const OBSERVED_AT = new Date('2026-10-30T02:10:00.000Z');
const EARLIER_TIME = new Date('2026-10-30T02:00:00.000Z');
const LATER_TIME = new Date('2026-10-30T02:03:00.000Z');

// The wire form amqplib decodes for an AMQP timestamp: whole seconds since the epoch.
function wireTimestamp(time: Date): { '!': 'timestamp'; value: number } {
  return { '!': 'timestamp', value: Math.floor(time.getTime() / 1000) };
}

function death(overrides: Partial<DeathRecord>): DeathRecord {
  return {
    queue: SOURCE_QUEUE,
    reason: 'rejected',
    count: 1,
    time: EARLIER_TIME,
    exchange: 'app.events',
    routingKeys: ['employee.profile.updated'],
    ...overrides,
  };
}

describe('readDeathRecords', () => {
  it.each([
    { condition: 'the headers are absent', headers: undefined },
    {
      condition: 'the headers have no x-death entry',
      headers: { 'content-type': 'application/json' },
    },
    { condition: 'the x-death header is not a list', headers: { 'x-death': 'rejected' } },
    { condition: 'the headers are not an object', headers: 'x-death' },
  ])('should return no entries when $condition', ({ headers }) => {
    expect(readDeathRecords(headers)).toEqual([]);
  });

  it.each([
    {
      condition: 'the count is zero',
      entry: {
        queue: SOURCE_QUEUE,
        reason: 'rejected',
        count: 0,
        time: wireTimestamp(EARLIER_TIME),
      },
    },
    {
      condition: 'the count is a string',
      entry: {
        queue: SOURCE_QUEUE,
        reason: 'rejected',
        count: '1',
        time: wireTimestamp(EARLIER_TIME),
      },
    },
    {
      condition: 'the time is not a date',
      entry: { queue: SOURCE_QUEUE, reason: 'rejected', count: 1, time: '2026-10-30T02:00:00Z' },
    },
    {
      condition: 'the timestamp is not whole seconds',
      entry: {
        queue: SOURCE_QUEUE,
        reason: 'rejected',
        count: 1,
        time: { '!': 'timestamp', value: 1.5 },
      },
    },
    {
      condition: 'the queue is missing',
      entry: { reason: 'rejected', count: 1, time: wireTimestamp(EARLIER_TIME) },
    },
  ])('should skip an entry when $condition', ({ entry }) => {
    expect(readDeathRecords({ 'x-death': [entry] })).toEqual([]);
  });

  it('should map the RabbitMQ field names to death records and drop unknown fields', () => {
    const headers = {
      'x-death': [
        {
          queue: SOURCE_QUEUE,
          reason: 'delivery_limit',
          count: 2,
          time: wireTimestamp(LATER_TIME),
          exchange: 'app.events',
          'routing-keys': ['employee.profile.updated'],
          'original-expiration': '60000',
        },
      ],
    };

    expect(readDeathRecords(headers)).toEqual([
      {
        queue: SOURCE_QUEUE,
        reason: 'delivery_limit',
        count: 2,
        time: LATER_TIME,
        exchange: 'app.events',
        routingKeys: ['employee.profile.updated'],
      },
    ]);
  });
});

describe('summarizeFailures', () => {
  it.each([
    {
      condition: 'the message has no x-death entry for its source queue',
      deaths: [] as DeathRecord[],
      expected: {
        attemptCount: 1,
        lastError: 'unknown',
        firstFailedAt: OBSERVED_AT,
        lastFailedAt: OBSERVED_AT,
      },
    },
    {
      condition: 'the only x-death entry is for another queue',
      deaths: [death({ queue: 'notification.events' })],
      expected: {
        attemptCount: 1,
        lastError: 'unknown',
        firstFailedAt: OBSERVED_AT,
        lastFailedAt: OBSERVED_AT,
      },
    },
    {
      condition: 'there is one failure',
      deaths: [death({ reason: 'rejected', count: 1, time: EARLIER_TIME })],
      expected: {
        attemptCount: 1,
        lastError: 'rejected',
        firstFailedAt: EARLIER_TIME,
        lastFailedAt: EARLIER_TIME,
      },
    },
    {
      condition: 'the later failure is listed first',
      deaths: [
        death({ reason: 'delivery_limit', count: 2, time: LATER_TIME }),
        death({ reason: 'rejected', count: 1, time: EARLIER_TIME }),
      ],
      expected: {
        attemptCount: 2,
        lastError: 'delivery_limit',
        firstFailedAt: EARLIER_TIME,
        lastFailedAt: LATER_TIME,
      },
    },
    {
      condition: 'the earlier failure is listed first',
      deaths: [
        death({ reason: 'rejected', count: 1, time: EARLIER_TIME }),
        death({ reason: 'delivery_limit', count: 2, time: LATER_TIME }),
      ],
      expected: {
        attemptCount: 2,
        lastError: 'delivery_limit',
        firstFailedAt: EARLIER_TIME,
        lastFailedAt: LATER_TIME,
      },
    },
    {
      condition: 'another queue failed later than the source queue',
      deaths: [
        death({ reason: 'rejected', count: 1, time: EARLIER_TIME }),
        death({
          queue: 'notification.events',
          reason: 'delivery_limit',
          count: 3,
          time: LATER_TIME,
        }),
      ],
      expected: {
        attemptCount: 1,
        lastError: 'rejected',
        firstFailedAt: EARLIER_TIME,
        lastFailedAt: EARLIER_TIME,
      },
    },
  ])(
    'should derive the attempt count and failure times when $condition',
    ({ deaths, expected }) => {
      expect(summarizeFailures(deaths, SOURCE_QUEUE, OBSERVED_AT)).toEqual(expected);
    },
  );
});
