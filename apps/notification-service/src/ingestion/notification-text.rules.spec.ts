import { EventName } from '@dexa/contracts';
import type { NotifiableEvent, NotifiableField } from './notifiable-event.rules.js';
import {
  UNAVAILABLE_EMPLOYEE_NAME,
  describeAttendanceRequest,
  describeChangedFields,
  describeNotification,
  resolveEmployeeName,
} from './notification-text.rules.js';

const ACCOUNT_ID = '5b7e2c1a-9f3d-4e6b-8a2c-1d0e9f8a7b6c';
const ACTOR_ACCOUNT_ID = '2c9d4f7e-1a3b-4c5d-9e8f-0a1b2c3d4e5f';
const OTHER_ACCOUNT_ID = '7a1d2e3f-4b5c-4d6e-8f70-1a2b3c4d5e6f';

function profileEvent(changedFields: ReadonlyArray<NotifiableField>): NotifiableEvent {
  return {
    eventType: EventName.EMPLOYEE_PROFILE_UPDATED,
    eventId: '0f1d6a8e-4c1b-4a55-9d2e-7b3c2a1f0e9d',
    occurredAt: new Date('2026-10-30T02:05:00.000Z'),
    subjectAccountId: ACCOUNT_ID,
    actorAccountId: ACTOR_ACCOUNT_ID,
    changedFields,
    employeeName: 'Budi Santoso',
  };
}

function passwordEvent(): NotifiableEvent {
  return {
    eventType: EventName.ACCOUNT_PASSWORD_CHANGED,
    eventId: '0f1d6a8e-4c1b-4a55-9d2e-7b3c2a1f0e9d',
    occurredAt: new Date('2026-10-30T02:05:00.000Z'),
    subjectAccountId: ACCOUNT_ID,
    actorAccountId: ACCOUNT_ID,
    changedFields: ['password'],
  };
}

describe('describeChangedFields', () => {
  it.each([
    { fields: ['phoneNumber'] as const, label: 'phone number' },
    { fields: ['photo'] as const, label: 'photo' },
    { fields: ['name'] as const, label: 'name' },
    { fields: ['position'] as const, label: 'position' },
    { fields: ['employeeStatus'] as const, label: 'employee status' },
    { fields: ['profileStatus'] as const, label: 'profile status' },
    { fields: ['password'] as const, label: 'password' },
    { fields: ['phoneNumber', 'photo'] as const, label: 'phone number, photo' },
  ])('should label $fields as "$label"', ({ fields, label }) => {
    expect(describeChangedFields(fields)).toBe(label);
  });
});

describe('describeNotification', () => {
  it.each([
    {
      condition: 'the phone number changed',
      event: profileEvent(['phoneNumber']),
      title: 'Budi Santoso updated: phone number',
      body: 'Changed fields: phone number.',
    },
    {
      condition: 'the phone number and photo changed',
      event: profileEvent(['phoneNumber', 'photo']),
      title: 'Budi Santoso updated: phone number, photo',
      body: 'Changed fields: phone number, photo.',
    },
    {
      condition: 'the password changed',
      event: passwordEvent(),
      title: 'Budi Santoso changed their password',
      body: 'Changed fields: password.',
    },
  ])('should title and describe the event when $condition', ({ event, title, body }) => {
    expect(describeNotification(event, 'Budi Santoso')).toEqual({ title, body });
  });

  it('should fall back to a short title when the field list would overflow the title column', () => {
    const longName = 'A'.repeat(150);
    const event = profileEvent([
      'phoneNumber',
      'photo',
      'name',
      'position',
      'employeeStatus',
      'profileStatus',
    ]);

    const text = describeNotification(event, longName);

    expect(text.title).toBe(`${longName} updated their profile`);
    expect(text.title.length).toBeLessThanOrEqual(200);
    expect(text.body).toBe(
      'Changed fields: phone number, photo, name, position, employee status, profile status.',
    );
  });

  it('should keep the detailed title at exactly the title limit', () => {
    const subjectName = 'A'.repeat(200 - ' updated: phone number'.length);
    const text = describeNotification(profileEvent(['phoneNumber']), subjectName);

    expect(text.title).toBe(`${subjectName} updated: phone number`);
    expect(text.title.length).toBe(200);
  });

  it('should title an attendance request event with the requester name and the request kind', () => {
    const event: NotifiableEvent = {
      eventType: EventName.ATTENDANCE_REQUEST_SUBMITTED,
      eventId: '0f1d6a8e-4c1b-4a55-9d2e-7b3c2a1f0e9d',
      occurredAt: new Date('2026-10-30T02:05:00.000Z'),
      subjectAccountId: ACCOUNT_ID,
      actorAccountId: ACCOUNT_ID,
      changedFields: [],
      resourceType: 'attendance_adjustment_request',
      resourceId: 'e2b1c4a0-7d3e-4b9a-8c1d-0e2f4a6b8c0d',
      businessDate: '2026-10-28',
    };

    expect(describeNotification(event, 'Budi Santoso')).toEqual({
      title: 'Budi Santoso requested an attendance correction for 2026-10-28',
      body: 'Open the request to review it.',
    });
  });
});

describe('describeAttendanceRequest', () => {
  it.each([
    {
      condition: 'an overtime request is submitted',
      resourceType: 'overtime_request' as const,
      title: 'Budi Santoso requested overtime for 2026-10-28',
    },
    {
      condition: 'an attendance correction is submitted',
      resourceType: 'attendance_adjustment_request' as const,
      title: 'Budi Santoso requested an attendance correction for 2026-10-28',
    },
  ])('should title the request when $condition', ({ resourceType, title }) => {
    const text = describeAttendanceRequest({
      resourceType,
      businessDate: '2026-10-28',
      requesterName: 'Budi Santoso',
    });

    expect(text).toEqual({ title, body: 'Open the request to review it.' });
  });

  it('should keep the longest correction title within the 200-character column', () => {
    const requesterName = 'A'.repeat(150);
    const text = describeAttendanceRequest({
      resourceType: 'attendance_adjustment_request',
      businessDate: '2026-10-28',
      requesterName,
    });

    expect(text.title).toBe(`${requesterName} requested an attendance correction for 2026-10-28`);
    expect(text.title.length).toBe(200);
  });

  it('should leave out any reason, since the event carries none', () => {
    const text = describeAttendanceRequest({
      resourceType: 'overtime_request',
      businessDate: '2026-10-28',
      requesterName: 'Budi Santoso',
    });

    expect(`${text.title} ${text.body}`.toLowerCase()).not.toContain('reason');
  });
});

describe('resolveEmployeeName', () => {
  const EMPLOYEE = {
    accountId: ACCOUNT_ID,
    name: 'Ada Lovelace',
    positionName: 'Fullstack Developer',
  };

  it('should return the name Employee answers for the account', () => {
    expect(resolveEmployeeName([EMPLOYEE], ACCOUNT_ID)).toBe('Ada Lovelace');
  });

  it('should return the unavailable placeholder when Employee does not know the account', () => {
    expect(resolveEmployeeName([EMPLOYEE], OTHER_ACCOUNT_ID)).toBe(UNAVAILABLE_EMPLOYEE_NAME);
    expect(resolveEmployeeName([], ACCOUNT_ID)).toBe('Unavailable employee');
  });
});
