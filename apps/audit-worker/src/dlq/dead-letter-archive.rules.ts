import { eventEnvelopeSchema } from '@dexa/contracts';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { deriveAttemptCount, readDeliveryCount } from './delivery-count.rules.js';
import {
  readDeathRecords,
  summarizeFailures,
  X_DEATH_HEADER,
  type DeathRecord,
} from './x-death.rules.js';

/** A dead-lettered delivery as the broker delivered it. Its fields are untrusted until the rules narrow them. */
export type DeadLetterDelivery = {
  readonly content: Buffer;
  readonly messageId: unknown;
  readonly headers: unknown;
};

/** One dlq_messages row to upsert. Holds the original bytes, and only non-sensitive headers. */
export type DeadLetterArchiveRecord = {
  readonly messageId: string;
  readonly eventId: string | null;
  readonly sourceQueue: string;
  readonly payload: Buffer;
  readonly headers: Readonly<Record<string, unknown>>;
  readonly attemptCount: number;
  readonly lastError: string;
  readonly firstFailedAt: Date;
  readonly lastFailedAt: Date;
};

// dlq_messages.message_id is varchar(255); a longer AMQP message ID would fail the insert on every redelivery.
const MAX_MESSAGE_ID_LENGTH = 255;
const FALLBACK_MESSAGE_ID_PREFIX = 'sha256:';

// Nest's RMQ envelope wraps the event in `data`. The event ID rule is the contract's, so it is reused here.
const nestEnvelopeEventIdSchema = z.object({
  data: z.object({ eventId: eventEnvelopeSchema.shape.eventId }),
});

/**
 * Maps one dead-lettered delivery to its dlq_messages row. `observedAt` is the server instant used only when the
 * delivery carries no x-death entry for the source queue, so the caller supplies it and this function reads no clock.
 */
export function buildDeadLetterArchiveRecord(input: {
  readonly sourceQueue: string;
  readonly delivery: DeadLetterDelivery;
  readonly observedAt: Date;
}): DeadLetterArchiveRecord {
  const { sourceQueue, delivery, observedAt } = input;
  const deaths = readDeathRecords(delivery.headers);
  const failure = summarizeFailures(deaths, sourceQueue, observedAt);
  return {
    messageId: readMessageId(delivery, sourceQueue),
    eventId: readEventId(delivery.content),
    sourceQueue,
    payload: delivery.content,
    headers: toArchivedHeaders(deaths),
    attemptCount: deriveAttemptCount({
      deliveryCount: readDeliveryCount(delivery.headers),
      lastError: failure.lastError,
    }),
    lastError: failure.lastError,
    firstFailedAt: failure.firstFailedAt,
    lastFailedAt: failure.lastFailedAt,
  };
}

/**
 * The AMQP message ID when it is usable. Otherwise a key derived from the source queue and the body, so a redelivery
 * of the same message maps to the same row.
 */
export function readMessageId(delivery: DeadLetterDelivery, sourceQueue: string): string {
  const { messageId } = delivery;
  if (isUsableMessageId(messageId)) {
    return messageId;
  }
  const digest = createHash('sha256')
    .update(sourceQueue)
    .update('\0')
    .update(delivery.content)
    .digest('hex');
  return `${FALLBACK_MESSAGE_ID_PREFIX}${digest}`;
}

function isUsableMessageId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    Array.from(value).length <= MAX_MESSAGE_ID_LENGTH
  );
}

/** The event ID from a Nest envelope body, or null when the body is not JSON or carries no valid event ID. */
export function readEventId(content: Buffer): string | null {
  const parsed = nestEnvelopeEventIdSchema.safeParse(parseJsonBody(content));
  return parsed.success ? parsed.data.data.eventId : null;
}

function parseJsonBody(content: Buffer): unknown {
  try {
    return JSON.parse(content.toString('utf8'));
  } catch {
    // A body that is not JSON has no event ID. It is still archived, byte for byte.
    return undefined;
  }
}

// Only x-death is archived. Other headers are not needed for diagnosis and may carry data the ledger should not hold.
function toArchivedHeaders(deaths: ReadonlyArray<DeathRecord>): Readonly<Record<string, unknown>> {
  if (deaths.length === 0) {
    return {};
  }
  return { [X_DEATH_HEADER]: deaths.map(toWireDeath) };
}

function toWireDeath(death: DeathRecord): Record<string, unknown> {
  return {
    queue: death.queue,
    reason: death.reason,
    count: death.count,
    time: death.time.toISOString(),
    exchange: death.exchange,
    'routing-keys': death.routingKeys,
  };
}
