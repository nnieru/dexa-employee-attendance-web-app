import { EventName } from '@dexa/contracts';
import type { EventMessage } from '@dexa/messaging';
import { decideNotifiableEvent } from './notifiable-event.rules.js';

const EVENT_ID = '0f1d6a8e-4c1b-4a55-9d2e-7b3c2a1f0e9d';
const ACCOUNT_ID = '5b7e2c1a-9f3d-4e6b-8a2c-1d0e9f8a7b6c';
const ACTOR_ACCOUNT_ID = '2c9d4f7e-1a3b-4c5d-9e8f-0a1b2c3d4e5f';
const OCCURRED_AT = '2026-10-30T02:05:00.000Z';

function envelopeOf(type: string, payload: unknown): EventMessage {
  return { eventId: EVENT_ID, type, occurredAt: OCCURRED_AT, payload };
}

const PROFILE_PAYLOAD = {
  accountId: ACCOUNT_ID,
  actorAccountId: ACTOR_ACCOUNT_ID,
  employeeName: 'Budi Santoso',
  changedFields: ['phoneNumber', 'photo'],
};

const PASSWORD_PAYLOAD = {
  accountId: ACCOUNT_ID,
  actorAccountId: ACCOUNT_ID,
  changedFields: ['password'],
};

const REQUEST_PAYLOAD = {
  accountId: ACCOUNT_ID,
  actorAccountId: ACCOUNT_ID,
  resourceType: 'overtime_request',
  resourceId: 'e2b1c4a0-7d3e-4b9a-8c1d-0e2f4a6b8c0d',
  businessDate: '2026-10-28',
  changedFields: [],
};

describe('decideNotifiableEvent', () => {
  it.each([
    {
      condition: 'an employee.profile.updated event carries a valid payload',
      event: envelopeOf(EventName.EMPLOYEE_PROFILE_UPDATED, PROFILE_PAYLOAD),
      expected: {
        kind: 'accepted',
        event: {
          eventType: 'employee.profile.updated',
          eventId: EVENT_ID,
          occurredAt: new Date(OCCURRED_AT),
          subjectAccountId: ACCOUNT_ID,
          actorAccountId: ACTOR_ACCOUNT_ID,
          changedFields: ['phoneNumber', 'photo'],
          employeeName: 'Budi Santoso',
        },
      },
    },
    {
      condition: 'an account.password.changed event carries a valid payload',
      event: envelopeOf(EventName.ACCOUNT_PASSWORD_CHANGED, PASSWORD_PAYLOAD),
      expected: {
        kind: 'accepted',
        event: {
          eventType: 'account.password.changed',
          eventId: EVENT_ID,
          occurredAt: new Date(OCCURRED_AT),
          subjectAccountId: ACCOUNT_ID,
          actorAccountId: ACCOUNT_ID,
          changedFields: ['password'],
        },
      },
    },
    {
      condition: 'an attendance.request.submitted event carries a valid payload',
      event: envelopeOf(EventName.ATTENDANCE_REQUEST_SUBMITTED, REQUEST_PAYLOAD),
      expected: {
        kind: 'accepted',
        event: {
          eventType: 'attendance.request.submitted',
          eventId: EVENT_ID,
          occurredAt: new Date(OCCURRED_AT),
          subjectAccountId: ACCOUNT_ID,
          actorAccountId: ACCOUNT_ID,
          changedFields: [],
          resourceType: 'overtime_request',
          resourceId: 'e2b1c4a0-7d3e-4b9a-8c1d-0e2f4a6b8c0d',
          businessDate: '2026-10-28',
        },
      },
    },
  ])('should accept the event when $condition', ({ event, expected }) => {
    expect(decideNotifiableEvent(event)).toEqual(expected);
  });

  it.each([
    {
      condition: 'the profile payload carries an old value',
      event: envelopeOf(EventName.EMPLOYEE_PROFILE_UPDATED, {
        ...PROFILE_PAYLOAD,
        oldValues: { phoneNumber: '0811' },
      }),
    },
    {
      condition: 'the profile payload has no employee name',
      event: envelopeOf(EventName.EMPLOYEE_PROFILE_UPDATED, {
        ...PROFILE_PAYLOAD,
        employeeName: undefined,
      }),
    },
    {
      condition: 'the profile payload names an unknown field',
      event: envelopeOf(EventName.EMPLOYEE_PROFILE_UPDATED, {
        ...PROFILE_PAYLOAD,
        changedFields: ['email'],
      }),
    },
    {
      condition: 'the password payload carries a password value',
      event: envelopeOf(EventName.ACCOUNT_PASSWORD_CHANGED, {
        ...PASSWORD_PAYLOAD,
        password: 'new-pass-123',
      }),
    },
    {
      condition: 'the password payload lists a second field',
      event: envelopeOf(EventName.ACCOUNT_PASSWORD_CHANGED, {
        ...PASSWORD_PAYLOAD,
        changedFields: ['password', 'phoneNumber'],
      }),
    },
    {
      condition: 'the account ID is not a UUID',
      event: envelopeOf(EventName.ACCOUNT_PASSWORD_CHANGED, {
        ...PASSWORD_PAYLOAD,
        accountId: 'acc-1',
      }),
    },
    {
      condition: 'the request payload carries a reason',
      event: envelopeOf(EventName.ATTENDANCE_REQUEST_SUBMITTED, {
        ...REQUEST_PAYLOAD,
        reason: 'Client visit',
      }),
    },
    {
      condition: 'the request payload carries a review reason',
      event: envelopeOf(EventName.ATTENDANCE_REQUEST_SUBMITTED, {
        ...REQUEST_PAYLOAD,
        reviewReason: 'Approved',
      }),
    },
    {
      condition: 'the request payload names a changed field',
      event: envelopeOf(EventName.ATTENDANCE_REQUEST_SUBMITTED, {
        ...REQUEST_PAYLOAD,
        changedFields: ['phoneNumber'],
      }),
    },
    {
      condition: 'the request resource type is unknown',
      event: envelopeOf(EventName.ATTENDANCE_REQUEST_SUBMITTED, {
        ...REQUEST_PAYLOAD,
        resourceType: 'leave_request',
      }),
    },
    {
      condition: 'the request business date is not a calendar date',
      event: envelopeOf(EventName.ATTENDANCE_REQUEST_SUBMITTED, {
        ...REQUEST_PAYLOAD,
        businessDate: '2026-02-30',
      }),
    },
  ])('should reject the event as an invalid payload when $condition', ({ event }) => {
    expect(decideNotifiableEvent(event)).toEqual({ kind: 'rejected', reason: 'invalid-payload' });
  });

  it.each([EventName.ATTENDANCE_REQUEST_APPROVED, EventName.ATTENDANCE_REQUEST_REJECTED])(
    'should reject the event as an unsupported type when %s is received',
    (eventType) => {
      const event = envelopeOf(eventType, REQUEST_PAYLOAD);

      expect(decideNotifiableEvent(event)).toEqual({
        kind: 'rejected',
        reason: 'unsupported-event-type',
      });
    },
  );
});
