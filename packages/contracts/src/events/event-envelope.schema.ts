import { z } from 'zod';

// Matches the EventMessage that libs/messaging publishes and consumes: the outbox stores exactly these four
// keys, and the RMQ record body carries them unchanged. Strict, so a message with an unknown top-level key
// is rejected instead of being acknowledged with the key silently dropped.
// The payload is validated by the schema of its event type, not here.
export const eventEnvelopeSchema = z.strictObject({
  // Also the AMQP message ID and the key consumers deduplicate on.
  eventId: z.uuid(),
  type: z.string().min(1),
  // Server UTC instant, written with a trailing Z (ARCHITECTURE §8).
  occurredAt: z.iso.datetime(),
  payload: z.unknown(),
});

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;
