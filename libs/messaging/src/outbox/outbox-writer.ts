import { parseEventMessage, type EventMessage } from '../event-message.js';
import { InvalidOutboxEventError } from './outbox.errors.js';
import { outboxEvents } from './outbox-events.table.js';
import type { IOutboxWriter, OutboxTransaction } from './outbox-writer.interface.js';

export class OutboxWriter implements IOutboxWriter {
  async add(transaction: OutboxTransaction, event: EventMessage): Promise<void> {
    const envelope = parseEventMessage(event);
    if (envelope.kind === 'invalid' || !isTimestamp(envelope.message.occurredAt)) {
      throw new InvalidOutboxEventError();
    }
    // The stored payload is the parsed envelope, so fields the envelope does not define are not persisted.
    await transaction.insert(outboxEvents).values({
      id: envelope.message.eventId,
      eventType: envelope.message.type,
      payload: envelope.message,
      occurredAt: new Date(envelope.message.occurredAt),
    });
  }
}

function isTimestamp(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}
