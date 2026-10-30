import { parseEventMessage } from './event-message.js';

const VALID_ENVELOPE = {
  eventId: '6f1c2a7e-3b4d-4e8f-9a1b-2c3d4e5f6a7b',
  type: 'employee.profile.updated',
  occurredAt: '2026-10-29T03:15:00.000Z',
  payload: { accountId: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', changedFields: ['phoneNumber'] },
};

describe('parseEventMessage', () => {
  it('should return the envelope when the value has eventId, type, occurredAt and payload', () => {
    expect(parseEventMessage(VALID_ENVELOPE)).toEqual({ kind: 'valid', message: VALID_ENVELOPE });
  });

  it.each([
    { condition: 'the value is a string', value: 'employee.profile.updated' },
    { condition: 'the value is null', value: null },
    { condition: 'the value is an array', value: [] },
    { condition: 'the eventId is missing', value: { ...VALID_ENVELOPE, eventId: undefined } },
    { condition: 'the type is an empty string', value: { ...VALID_ENVELOPE, type: '' } },
    {
      condition: 'the occurredAt is a number',
      value: { ...VALID_ENVELOPE, occurredAt: 1793243700 },
    },
    { condition: 'the eventId is not a UUID', value: { ...VALID_ENVELOPE, eventId: 'evt-1' } },
    {
      condition: 'the occurredAt is not an ISO datetime',
      value: { ...VALID_ENVELOPE, occurredAt: 'soon' },
    },
    {
      condition: 'the message has a top-level key that the envelope does not define',
      value: { ...VALID_ENVELOPE, routingKey: 'employee.profile.updated' },
    },
    {
      condition: 'the payload key is missing',
      value: {
        eventId: VALID_ENVELOPE.eventId,
        type: VALID_ENVELOPE.type,
        occurredAt: VALID_ENVELOPE.occurredAt,
      },
    },
  ])('should report an invalid message when $condition', ({ value }) => {
    expect(parseEventMessage(value)).toEqual({ kind: 'invalid' });
  });
});
