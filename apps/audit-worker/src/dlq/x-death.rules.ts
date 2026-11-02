import { z } from 'zod';

/**
 * One entry of RabbitMQ's x-death header. RabbitMQ keeps one entry per (queue, reason) pair and increments its
 * count on each dead-letter event, so the entry for the latest failure carries the attempt count.
 */
export type DeathRecord = {
  readonly queue: string;
  readonly reason: string;
  readonly count: number;
  readonly time: Date;
  readonly exchange: string | undefined;
  readonly routingKeys: ReadonlyArray<string> | undefined;
};

/** The failure facts stored in dlq_messages, derived from the x-death header of one message. */
export type FailureSummary = {
  readonly lastError: string;
  readonly firstFailedAt: Date;
  readonly lastFailedAt: Date;
};

export const X_DEATH_HEADER = 'x-death';

const MILLISECONDS_PER_SECOND = 1000;

/**
 * Used when a message reaches the DLQ without an x-death entry for its source queue, such as a message published
 * straight to the DLQ. The application's error text is never placed in headers, so there is no richer reason.
 */
export const UNRECORDED_FAILURE_REASON = 'unknown';

// amqplib decodes an AMQP timestamp as a tagged object whose value is whole seconds since the epoch.
const amqpTimestampSchema = z
  .object({ '!': z.literal('timestamp'), value: z.number().int().nonnegative() })
  .transform((timestamp) => new Date(timestamp.value * MILLISECONDS_PER_SECOND));

// Broker headers are input to this service, so each entry is parsed rather than cast. An entry that does not match
// is skipped: a guessed attempt count would misreport the failure.
const deathEntrySchema = z.object({
  queue: z.string().min(1),
  reason: z.string().min(1),
  count: z.number().int().min(1),
  time: amqpTimestampSchema,
  exchange: z.string().optional(),
  'routing-keys': z.array(z.string()).optional(),
});

/** Reads every well-formed x-death entry. Returns an empty list when the headers or the header are absent. */
export function readDeathRecords(headers: unknown): ReadonlyArray<DeathRecord> {
  const entries = readXDeathEntries(headers);
  return entries.flatMap((entry: unknown) => {
    const parsed = deathEntrySchema.safeParse(entry);
    if (!parsed.success) {
      return [];
    }
    return [
      {
        queue: parsed.data.queue,
        reason: parsed.data.reason,
        count: parsed.data.count,
        time: parsed.data.time,
        exchange: parsed.data.exchange,
        routingKeys: parsed.data['routing-keys'],
      },
    ];
  });
}

function readXDeathEntries(headers: unknown): ReadonlyArray<unknown> {
  if (typeof headers !== 'object' || headers === null || Array.isArray(headers)) {
    return [];
  }
  const entries: unknown = Reflect.get(headers, X_DEATH_HEADER);
  return Array.isArray(entries) ? entries : [];
}

/**
 * Derives the failure facts for one source queue. The latest failure (largest time) supplies the reason; the
 * earliest failure supplies first_failed_at. Entries from other queues are ignored. The attempt count is not here:
 * it comes from the delivery counters (delivery-count.rules.ts).
 */
export function summarizeFailures(
  deaths: ReadonlyArray<DeathRecord>,
  sourceQueue: string,
  observedAt: Date,
): FailureSummary {
  const sourceDeaths = deaths.filter((death) => death.queue === sourceQueue);
  const [firstDeath, ...otherDeaths] = sourceDeaths;
  if (firstDeath === undefined) {
    return {
      lastError: UNRECORDED_FAILURE_REASON,
      firstFailedAt: observedAt,
      lastFailedAt: observedAt,
    };
  }
  const latestDeath = otherDeaths.reduce(
    (latest, death) => (death.time.getTime() > latest.time.getTime() ? death : latest),
    firstDeath,
  );
  const earliestTime = otherDeaths.reduce(
    (earliest, death) => (death.time.getTime() < earliest.getTime() ? death.time : earliest),
    firstDeath.time,
  );
  return {
    lastError: latestDeath.reason,
    firstFailedAt: earliestTime,
    lastFailedAt: latestDeath.time,
  };
}
