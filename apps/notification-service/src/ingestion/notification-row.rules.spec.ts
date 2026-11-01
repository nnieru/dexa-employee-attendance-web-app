import { EventName } from '@dexa/contracts';
import type { NotifiableEvent } from './notifiable-event.rules.js';
import { buildNotificationRows, excludeRequesterFromRecipients } from './notification-row.rules.js';

const REQUESTER_ACCOUNT_ID = '5b7e2c1a-9f3d-4e6b-8a2c-1d0e9f8a7b6c';
const FIRST_HR_ACCOUNT_ID = '2c9d4f7e-1a3b-4c5d-9e8f-0a1b2c3d4e5f';
const SECOND_HR_ACCOUNT_ID = '7a1d2e3f-4b5c-4d6e-8f70-1a2b3c4d5e6f';

describe('excludeRequesterFromRecipients', () => {
  it.each([
    {
      condition: 'the requester is an HR account',
      recipients: [REQUESTER_ACCOUNT_ID, FIRST_HR_ACCOUNT_ID, SECOND_HR_ACCOUNT_ID],
      expected: [FIRST_HR_ACCOUNT_ID, SECOND_HR_ACCOUNT_ID],
    },
    {
      condition: 'the requester is not an HR account',
      recipients: [FIRST_HR_ACCOUNT_ID, SECOND_HR_ACCOUNT_ID],
      expected: [FIRST_HR_ACCOUNT_ID, SECOND_HR_ACCOUNT_ID],
    },
    {
      condition: 'the requester is the only HR account',
      recipients: [REQUESTER_ACCOUNT_ID],
      expected: [],
    },
    {
      condition: 'there are no HR accounts',
      recipients: [],
      expected: [],
    },
  ])('should leave only the other HR accounts when $condition', ({ recipients, expected }) => {
    expect(excludeRequesterFromRecipients(recipients, REQUESTER_ACCOUNT_ID)).toEqual(expected);
  });
});

const EVENT_ID = '0f1d6a8e-4c1b-4a55-9d2e-7b3c2a1f0e9d';
const RESOURCE_ID = 'e2b1c4a0-7d3e-4b9a-8c1d-0e2f4a6b8c0d';
const OCCURRED_AT = new Date('2026-10-30T02:05:00.000Z');
const CREATED_AT = new Date('2026-10-30T02:05:01.000Z');
const TEXT = {
  title: 'Budi Santoso requested overtime for 2026-10-28',
  body: 'Open the request to review it.',
};

function requestEvent(): NotifiableEvent {
  return {
    eventType: EventName.ATTENDANCE_REQUEST_SUBMITTED,
    eventId: EVENT_ID,
    occurredAt: OCCURRED_AT,
    subjectAccountId: REQUESTER_ACCOUNT_ID,
    actorAccountId: REQUESTER_ACCOUNT_ID,
    changedFields: [],
    resourceType: 'overtime_request',
    resourceId: RESOURCE_ID,
    businessDate: '2026-10-28',
  };
}

function profileEvent(): NotifiableEvent {
  return {
    eventType: EventName.EMPLOYEE_PROFILE_UPDATED,
    eventId: EVENT_ID,
    occurredAt: OCCURRED_AT,
    subjectAccountId: REQUESTER_ACCOUNT_ID,
    actorAccountId: REQUESTER_ACCOUNT_ID,
    changedFields: ['phoneNumber'],
    employeeName: 'Budi Santoso',
  };
}

describe('buildNotificationRows', () => {
  it('should create one row per recipient except the requester for an attendance request', () => {
    const drafts = buildNotificationRows({
      event: requestEvent(),
      text: TEXT,
      recipientAccountIds: [REQUESTER_ACCOUNT_ID, FIRST_HR_ACCOUNT_ID, SECOND_HR_ACCOUNT_ID],
      createdAt: CREATED_AT,
    });

    expect(drafts.map((draft) => draft.recipientAccountId)).toEqual([
      FIRST_HR_ACCOUNT_ID,
      SECOND_HR_ACCOUNT_ID,
    ]);
  });

  it('should carry the request resource and no changed fields in each row', () => {
    const [draft] = buildNotificationRows({
      event: requestEvent(),
      text: TEXT,
      recipientAccountIds: [FIRST_HR_ACCOUNT_ID],
      createdAt: CREATED_AT,
    });

    expect(draft).toEqual({
      eventId: EVENT_ID,
      eventType: 'attendance.request.submitted',
      recipientAccountId: FIRST_HR_ACCOUNT_ID,
      subjectAccountId: REQUESTER_ACCOUNT_ID,
      actorAccountId: REQUESTER_ACCOUNT_ID,
      title: TEXT.title,
      body: TEXT.body,
      data: {
        changedFields: [],
        resourceType: 'overtime_request',
        resourceId: RESOURCE_ID,
        businessDate: '2026-10-28',
      },
      occurredAt: OCCURRED_AT,
      createdAt: CREATED_AT,
    });
  });

  it('should create no rows when the requester is the only HR account', () => {
    const drafts = buildNotificationRows({
      event: requestEvent(),
      text: TEXT,
      recipientAccountIds: [REQUESTER_ACCOUNT_ID],
      createdAt: CREATED_AT,
    });

    expect(drafts).toEqual([]);
  });

  it('should keep the actor as a recipient for a profile change, since only a request excludes its requester', () => {
    const drafts = buildNotificationRows({
      event: profileEvent(),
      text: TEXT,
      recipientAccountIds: [REQUESTER_ACCOUNT_ID, FIRST_HR_ACCOUNT_ID],
      createdAt: CREATED_AT,
    });

    expect(drafts.map((draft) => draft.recipientAccountId)).toEqual([
      REQUESTER_ACCOUNT_ID,
      FIRST_HR_ACCOUNT_ID,
    ]);
    expect(drafts[0]?.data).toEqual({ changedFields: ['phoneNumber'] });
  });
});
