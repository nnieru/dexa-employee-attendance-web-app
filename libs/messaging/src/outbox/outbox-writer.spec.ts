import type { EventMessage } from '../event-message.js';
import { outboxEvents } from './outbox-events.table.js';
import { InvalidOutboxEventError } from './outbox.errors.js';
import type { OutboxTransaction } from './outbox-writer.interface.js';
import { OutboxWriter } from './outbox-writer.js';

const EVENT: EventMessage = {
  eventId: '6f1c2a7e-3b4d-4e8f-9a1b-2c3d4e5f6a7b',
  type: 'employee.profile.updated',
  occurredAt: '2026-10-29T03:15:00.000Z',
  payload: { accountId: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', changedFields: ['phoneNumber'] },
};

type InsertCall = { readonly table: unknown; readonly row: unknown };

// Records the inserts the writer makes, in place of a database transaction.
function recordingTransaction(calls: InsertCall[]): OutboxTransaction {
  return {
    insert: (table) => ({
      values: (row) => {
        calls.push({ table, row });
        return Promise.resolve();
      },
    }),
  };
}

// The writer is typed for EventMessage, but a JSON body reaches it untyped. The cast gives the test that input.
function asEventMessage(value: unknown): EventMessage {
  return value as EventMessage;
}

describe('OutboxWriter', () => {
  it('should insert one row keyed by the event ID with the envelope as its payload when the event is valid', async () => {
    const calls: InsertCall[] = [];

    await new OutboxWriter().add(recordingTransaction(calls), EVENT);

    expect(calls).toEqual([
      {
        table: outboxEvents,
        row: {
          id: EVENT.eventId,
          eventType: EVENT.type,
          payload: EVENT,
          occurredAt: new Date(EVENT.occurredAt),
        },
      },
    ]);
  });

  it.each([
    { condition: 'the event ID is empty', event: { ...EVENT, eventId: '' } },
    { condition: 'the event type is empty', event: { ...EVENT, type: '' } },
    {
      condition: 'the occurred-at value is not a timestamp',
      event: { ...EVENT, occurredAt: 'soon' },
    },
    {
      condition: 'the payload is absent',
      event: { eventId: EVENT.eventId, type: EVENT.type, occurredAt: EVENT.occurredAt },
    },
    { condition: 'the event is not an object', event: 'employee.profile.updated' },
  ])(
    'should throw InvalidOutboxEventError and insert nothing when $condition',
    async ({ event }) => {
      const calls: InsertCall[] = [];

      await expect(
        new OutboxWriter().add(recordingTransaction(calls), asEventMessage(event)),
      ).rejects.toThrow(InvalidOutboxEventError);
      expect(calls).toEqual([]);
    },
  );
});
