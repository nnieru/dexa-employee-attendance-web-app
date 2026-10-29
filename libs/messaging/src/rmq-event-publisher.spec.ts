import { buildEventRecord, PUBLISH_TIMEOUT_MS } from './rmq-event-publisher.js';
import type { EventMessage } from './event-message.js';

const EVENT: EventMessage = {
  eventId: '6f1c2a7e-3b4d-4e8f-9a1b-2c3d4e5f6a7b',
  type: 'employee.profile.updated',
  occurredAt: '2026-10-29T03:15:00.000Z',
  payload: { accountId: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', changedFields: ['phoneNumber'] },
};

describe('buildEventRecord', () => {
  it('should carry the whole event as the record data when the record is built', () => {
    expect(buildEventRecord(EVENT).data).toEqual(EVENT);
  });

  it('should use the event ID as the AMQP message ID and the event type as its type when the record is built', () => {
    expect(buildEventRecord(EVENT).options).toMatchObject({
      messageId: EVENT.eventId,
      type: EVENT.type,
      contentType: 'application/json',
    });
  });

  it('should pass the publish timeout to the transport when the record is built', () => {
    expect(buildEventRecord(EVENT).options).toMatchObject({ timeout: PUBLISH_TIMEOUT_MS });
  });
});
