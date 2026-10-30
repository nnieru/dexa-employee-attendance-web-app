import {
  RETENTION_CHECK_INTERVAL_MS,
  RETRY_MAX_DELAY_MS,
  calculateNextAttemptAt,
  calculateRetentionCutoff,
  calculateRetryDelayMs,
  isRetentionDue,
} from './outbox.rules.js';

const NOW = new Date('2026-10-29T03:15:00.000Z');
const ONE_DAY_MS = 24 * 60 * 60 * 1_000;

describe('calculateRetryDelayMs', () => {
  it.each([
    { attemptCount: 1, expectedDelayMs: 1_000 },
    { attemptCount: 2, expectedDelayMs: 2_000 },
    { attemptCount: 3, expectedDelayMs: 4_000 },
    { attemptCount: 6, expectedDelayMs: 32_000 },
    { attemptCount: 7, expectedDelayMs: 60_000 },
  ])(
    'should wait $expectedDelayMs ms when the attempt count is $attemptCount',
    ({ attemptCount, expectedDelayMs }) => {
      expect(calculateRetryDelayMs(attemptCount)).toBe(expectedDelayMs);
    },
  );

  it('should stay at the maximum delay when the attempt count is very large', () => {
    expect(calculateRetryDelayMs(5_000)).toBe(RETRY_MAX_DELAY_MS);
  });

  it.each([0, -1, 1.5, Number.NaN])(
    'should throw a RangeError when the attempt count is %p',
    (attemptCount) => {
      expect(() => calculateRetryDelayMs(attemptCount)).toThrow(RangeError);
    },
  );
});

describe('calculateNextAttemptAt', () => {
  it('should schedule the next attempt the retry delay after the failed attempt when it is calculated', () => {
    expect(calculateNextAttemptAt(NOW, 3)).toEqual(new Date(NOW.getTime() + 4_000));
  });
});

describe('isRetentionDue', () => {
  it('should be due when retention has never run', () => {
    expect(isRetentionDue(undefined, NOW)).toBe(true);
  });

  it('should not be due when the last run was less than an hour ago', () => {
    const lastRun = new Date(NOW.getTime() - RETENTION_CHECK_INTERVAL_MS + 1);
    expect(isRetentionDue(lastRun, NOW)).toBe(false);
  });

  it('should be due when the last run was an hour ago', () => {
    const lastRun = new Date(NOW.getTime() - RETENTION_CHECK_INTERVAL_MS);
    expect(isRetentionDue(lastRun, NOW)).toBe(true);
  });
});

describe('calculateRetentionCutoff', () => {
  it('should return the instant the retention period before now when it is calculated', () => {
    expect(calculateRetentionCutoff(NOW, 7)).toEqual(new Date(NOW.getTime() - 7 * ONE_DAY_MS));
  });
});
