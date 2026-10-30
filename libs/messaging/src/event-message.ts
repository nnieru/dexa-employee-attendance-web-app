import { eventEnvelopeSchema, type EventEnvelope } from '@dexa/contracts';

/**
 * The envelope every event carries, derived from the contract schema in packages/contracts. `eventId` is
 * also the AMQP message ID, which is the key consumers deduplicate redeliveries on.
 */
export type EventMessage = Readonly<EventEnvelope>;

export type ParsedEventMessage =
  { readonly kind: 'valid'; readonly message: EventMessage } | { readonly kind: 'invalid' };

/**
 * Checks the envelope of a decoded message against eventEnvelopeSchema. Nest's RMQ transport parses the JSON
 * body first and passes the event to the handler, so this receives objects, not bytes. The payload stays
 * opaque here: each consumer validates the payload with the schema of its event type.
 */
export function parseEventMessage(value: unknown): ParsedEventMessage {
  const result = eventEnvelopeSchema.safeParse(value);
  if (!result.success) {
    return { kind: 'invalid' };
  }
  return { kind: 'valid', message: result.data };
}
