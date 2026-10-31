import { EventName } from '@dexa/contracts';
import type { EventMessage } from '@dexa/messaging';
import { decideAuditRecord, type AuditRecordDecision } from './audit-event.rules.js';

const EVENT_ID = '0f1d6a8e-4c1b-4a55-9d2e-7b3c2a1f0e9d';
const ACCOUNT_ID = '5b7e2c1a-9f3d-4e6b-8a2c-1d0e9f8a7b6c';
const ACTOR_ACCOUNT_ID = '2c9d4f7e-1a3b-4c5d-9e8f-0a1b2c3d4e5f';
const OCCURRED_AT = '2026-10-30T02:05:00.000Z';
const PROCESSED_AT = new Date('2026-10-30T02:05:01.000Z');
const EMPLOYEE_NAME = 'Ada Lovelace';

function envelopeOf(type: string, payload: unknown): EventMessage {
  return { eventId: EVENT_ID, type, occurredAt: OCCURRED_AT, payload };
}

const PROFILE_PAYLOAD = {
  accountId: ACCOUNT_ID,
  actorAccountId: ACTOR_ACCOUNT_ID,
  employeeName: EMPLOYEE_NAME,
  changedFields: ['phoneNumber', 'photo'],
};

const PASSWORD_PAYLOAD = {
  accountId: ACCOUNT_ID,
  actorAccountId: ACCOUNT_ID,
  changedFields: ['password'],
};

describe('decideAuditRecord', () => {
  it.each([
    {
      condition: 'an employee.profile.updated event',
      event: envelopeOf(EventName.EMPLOYEE_PROFILE_UPDATED, PROFILE_PAYLOAD),
      record: {
        eventId: EVENT_ID,
        eventType: 'employee.profile.updated',
        sourceService: 'employee-service',
        accountId: ACCOUNT_ID,
        actorAccountId: ACTOR_ACCOUNT_ID,
        changedFields: ['phoneNumber', 'photo'],
        occurredAt: new Date(OCCURRED_AT),
        processedAt: PROCESSED_AT,
      },
    },
    {
      condition: 'an account.password.changed event',
      event: envelopeOf(EventName.ACCOUNT_PASSWORD_CHANGED, PASSWORD_PAYLOAD),
      record: {
        eventId: EVENT_ID,
        eventType: 'account.password.changed',
        sourceService: 'auth-service',
        accountId: ACCOUNT_ID,
        actorAccountId: ACCOUNT_ID,
        changedFields: ['password'],
        occurredAt: new Date(OCCURRED_AT),
        processedAt: PROCESSED_AT,
      },
    },
  ])('should map $condition to one audit record without employee values', ({ event, record }) => {
    const decision = decideAuditRecord(event, PROCESSED_AT);

    expect(decision).toEqual({ kind: 'accepted', record });
    expect(JSON.stringify(decision)).not.toContain(EMPLOYEE_NAME);
  });

  it.each<{ condition: string; event: EventMessage; reason: string }>([
    {
      condition: 'the profile payload carries an extra value key',
      event: envelopeOf(EventName.EMPLOYEE_PROFILE_UPDATED, {
        ...PROFILE_PAYLOAD,
        oldValues: { phoneNumber: '+6281200000000' },
      }),
      reason: 'invalid-payload',
    },
    {
      condition: 'the profile payload lists no changed field',
      event: envelopeOf(EventName.EMPLOYEE_PROFILE_UPDATED, {
        ...PROFILE_PAYLOAD,
        changedFields: [],
      }),
      reason: 'invalid-payload',
    },
    {
      condition: 'the password payload lists a second field',
      event: envelopeOf(EventName.ACCOUNT_PASSWORD_CHANGED, {
        ...PASSWORD_PAYLOAD,
        changedFields: ['password', 'phoneNumber'],
      }),
      reason: 'invalid-payload',
    },
    {
      condition: 'the password payload carries a password hash',
      event: envelopeOf(EventName.ACCOUNT_PASSWORD_CHANGED, {
        ...PASSWORD_PAYLOAD,
        passwordHash: '$argon2id$v=19$placeholder',
      }),
      reason: 'invalid-payload',
    },
    {
      condition: 'the event type is not an audited type',
      event: envelopeOf('attendance.request.submitted', PASSWORD_PAYLOAD),
      reason: 'unsupported-event-type',
    },
  ])('should reject the event when $condition', ({ event, reason }) => {
    const decision: AuditRecordDecision = decideAuditRecord(event, PROCESSED_AT);

    expect(decision).toEqual({ kind: 'rejected', reason });
  });
});
