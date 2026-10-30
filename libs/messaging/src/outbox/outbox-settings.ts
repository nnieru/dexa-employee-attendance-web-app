/** How often the relay starts a pass. A service can override it through OutboxModuleOptions. */
const OUTBOX_POLL_INTERVAL_MS = 500;

/** Rows claimed per pass. A pass publishes them in order and stops at the first failure. */
const OUTBOX_BATCH_SIZE = 50;

/** Published rows are kept this long, so a restart or a slow consumer can still be inspected. */
const OUTBOX_RETENTION_DAYS = 7;

export type OutboxModuleOptions = {
  /** Token under which the owning service provides its `Database` from `@dexa/db`. */
  readonly databaseToken: symbol;
  readonly pollIntervalMs?: number;
  readonly batchSize?: number;
  readonly retentionDays?: number;
};

export type OutboxSettings = {
  readonly pollIntervalMs: number;
  readonly batchSize: number;
  readonly retentionDays: number;
};

/**
 * Applies the defaults and rejects values the relay cannot use. Module declaration calls this, so an invalid
 * value stops startup rather than failing on the first pass.
 */
export function resolveOutboxSettings(options: OutboxModuleOptions): OutboxSettings {
  return {
    pollIntervalMs: requirePositiveInteger(
      'pollIntervalMs',
      options.pollIntervalMs ?? OUTBOX_POLL_INTERVAL_MS,
    ),
    batchSize: requirePositiveInteger('batchSize', options.batchSize ?? OUTBOX_BATCH_SIZE),
    retentionDays: requirePositiveInteger(
      'retentionDays',
      options.retentionDays ?? OUTBOX_RETENTION_DAYS,
    ),
  };
}

function requirePositiveInteger(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`Outbox ${name} must be a positive integer, received ${value}`);
  }
  return value;
}
