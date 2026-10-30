import { eventEnvelopeSchema } from './event-envelope.schema.js';

const VALID_ENVELOPE = {
  eventId: '6f1c2a7e-3b4d-4e8f-9a1b-2c3d4e5f6a7b',
  type: 'employee.profile.updated',
  occurredAt: '2026-10-29T03:15:00.000Z',
  payload: { accountId: '9b1e4c7d-2f3a-4e5b-8c6d-1a2b3c4d5e6f', changedFields: ['phoneNumber'] },
};

describe('eventEnvelopeSchema', () => {
  it('should accept the envelope when eventId, type, occurredAt and payload are present', () => {
    expect(eventEnvelopeSchema.safeParse(VALID_ENVELOPE).success).toBe(true);
  });

  it('should accept the envelope when the payload is null', () => {
    expect(eventEnvelopeSchema.safeParse({ ...VALID_ENVELOPE, payload: null }).success).toBe(true);
  });

  it.each([
    {
      condition: 'the payload key is missing',
      body: {
        eventId: VALID_ENVELOPE.eventId,
        type: VALID_ENVELOPE.type,
        occurredAt: VALID_ENVELOPE.occurredAt,
      },
    },
    { condition: 'the eventId is not a UUID', body: { ...VALID_ENVELOPE, eventId: 'evt-1' } },
    {
      condition: 'the occurredAt is not an ISO datetime',
      body: { ...VALID_ENVELOPE, occurredAt: 'soon' },
    },
    {
      condition: 'the occurredAt has a local offset instead of UTC',
      body: { ...VALID_ENVELOPE, occurredAt: '2026-10-29T10:15:00+07:00' },
    },
    { condition: 'the type is an empty string', body: { ...VALID_ENVELOPE, type: '' } },
    {
      condition: 'the envelope has an unknown top-level key',
      body: { ...VALID_ENVELOPE, routingKey: 'employee.profile.updated' },
    },
  ])('should reject the envelope when $condition', ({ body }) => {
    expect(eventEnvelopeSchema.safeParse(body).success).toBe(false);
  });
});
