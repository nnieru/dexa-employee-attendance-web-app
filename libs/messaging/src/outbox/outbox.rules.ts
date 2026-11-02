/** The first retry waits this long; every later retry doubles the wait. */
const RETRY_BASE_DELAY_MS = 1_000;

/** Backoff never waits longer than this, so a recovered broker is retried within a minute. */
export const RETRY_MAX_DELAY_MS = 60_000;

/** Expired published events are deleted at most this often. */
export const RETENTION_CHECK_INTERVAL_MS = 60 * 60 * 1_000;

/** After this many failed attempts the relay logs at error level, so an event that keeps failing is visible. */
export const STUCK_EVENT_ATTEMPT_THRESHOLD = 10;

/**
 * How long a claim keeps other relays and later passes away from an event being published: it must exceed
 * one publish timeout, and a relay crash mid-publish recovers at most this long after it happened.
 */
export const CLAIM_LEASE_MILLISECONDS = 60_000;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;

/** Delay before the next attempt after `attemptCount` failed attempts: 1 s, 2 s, 4 s... capped at 60 s. */
export function calculateRetryDelayMs(attemptCount: number): number {
  if (!Number.isSafeInteger(attemptCount) || attemptCount < 1) {
    throw new RangeError(`Attempt count must be a positive integer, received ${attemptCount}`);
  }
  return Math.min(RETRY_BASE_DELAY_MS * 2 ** (attemptCount - 1), RETRY_MAX_DELAY_MS);
}

export function calculateNextAttemptAt(attemptedAt: Date, attemptCount: number): Date {
  return new Date(attemptedAt.getTime() + calculateRetryDelayMs(attemptCount));
}

export function isRetentionDue(lastRunAt: Date | undefined, now: Date): boolean {
  return (
    lastRunAt === undefined || now.getTime() - lastRunAt.getTime() >= RETENTION_CHECK_INTERVAL_MS
  );
}

export function calculateRetentionCutoff(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() - retentionDays * MILLISECONDS_PER_DAY);
}
