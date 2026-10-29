/** `eventId` is also the AMQP message ID, which is the key consumers deduplicate redeliveries on. */
export type EventMessage = {
  readonly eventId: string;
  readonly type: string;
  readonly occurredAt: string;
  readonly payload: unknown;
};

export type ParsedEventMessage =
  { readonly kind: 'valid'; readonly message: EventMessage } | { readonly kind: 'invalid' };

/**
 * Checks the envelope of a decoded message. Nest's RMQ transport parses the JSON body first and passes the
 * event to the handler, so this receives objects, not bytes. The payload stays opaque here: each consumer
 * validates the payload it understands. This check is hand-written because libs/messaging has no zod
 * dependency. When the envelope is shared, it should become a zod schema in packages/contracts.
 */
export function parseEventMessage(value: unknown): ParsedEventMessage {
  if (!isRecord(value)) {
    return { kind: 'invalid' };
  }
  const { eventId, type, occurredAt } = value;
  if (!isNonEmptyString(eventId) || !isNonEmptyString(type) || !isNonEmptyString(occurredAt)) {
    return { kind: 'invalid' };
  }
  if (!Object.hasOwn(value, 'payload')) {
    return { kind: 'invalid' };
  }
  return { kind: 'valid', message: { eventId, type, occurredAt, payload: value.payload } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
