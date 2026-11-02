// In-process retries of a failed archive write: 1 s, 2 s, 4 s, 8 s, five attempts in total.
export const ARCHIVE_RETRY_DELAYS_MS: ReadonlyArray<number> = [1_000, 2_000, 4_000, 8_000];

// How long the archive consumer stays cancelled after a transient failure.
export const CONSUMER_PAUSE_MS = 60_000;

/** Timings the consumer runs with. Production uses the defaults; tests inject short values. */
export type DeadLetterTiming = {
  readonly archiveRetryDelaysMs: ReadonlyArray<number>;
  readonly consumerPauseMs: number;
};

export const DEFAULT_DEAD_LETTER_TIMING: DeadLetterTiming = {
  archiveRetryDelaysMs: ARCHIVE_RETRY_DELAYS_MS,
  consumerPauseMs: CONSUMER_PAUSE_MS,
};
