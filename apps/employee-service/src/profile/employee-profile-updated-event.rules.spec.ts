import { EventName } from '@dexa/contracts';
import {
  buildEmployeeProfileUpdatedEvent,
  type EmployeeProfileUpdatedEventInput,
} from './employee-profile-updated-event.rules.js';

const EVENT_ID = '0c7d2f5e-3a9b-4c18-9e27-5b6d8f1a2c3e';
const ACCOUNT_ID = '9b1e4c7d-2f3a-4e5b-8c6d-1a2b3c4d5e6f';
const HR_ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const OCCURRED_AT = new Date('2026-10-30T03:15:00.000Z');

const VALID_INPUT: EmployeeProfileUpdatedEventInput = {
  eventId: EVENT_ID,
  occurredAt: OCCURRED_AT,
  accountId: ACCOUNT_ID,
  actorAccountId: ACCOUNT_ID,
  employeeName: 'Nadia Rahma',
  changedFields: ['phoneNumber', 'profileStatus'],
};

describe('buildEmployeeProfileUpdatedEvent', () => {
  it('should build the envelope with the event type, the event ID, and the UTC instant', () => {
    expect(buildEmployeeProfileUpdatedEvent(VALID_INPUT)).toEqual({
      eventId: EVENT_ID,
      type: EventName.EMPLOYEE_PROFILE_UPDATED,
      occurredAt: '2026-10-30T03:15:00.000Z',
      payload: {
        accountId: ACCOUNT_ID,
        actorAccountId: ACCOUNT_ID,
        employeeName: 'Nadia Rahma',
        changedFields: ['phoneNumber', 'profileStatus'],
      },
    });
  });

  it('should name the HR account as the actor when HR changed the profile', () => {
    const event = buildEmployeeProfileUpdatedEvent({
      ...VALID_INPUT,
      actorAccountId: HR_ACCOUNT_ID,
      changedFields: ['name'],
    });

    expect(event.payload).toEqual({
      accountId: ACCOUNT_ID,
      actorAccountId: HR_ACCOUNT_ID,
      employeeName: 'Nadia Rahma',
      changedFields: ['name'],
    });
  });

  it('should reject an empty change set, so an event never reports no change', () => {
    expect(() => buildEmployeeProfileUpdatedEvent({ ...VALID_INPUT, changedFields: [] })).toThrow();
  });

  it('should reject a repeated field name', () => {
    expect(() =>
      buildEmployeeProfileUpdatedEvent({ ...VALID_INPUT, changedFields: ['photo', 'photo'] }),
    ).toThrow();
  });
});
