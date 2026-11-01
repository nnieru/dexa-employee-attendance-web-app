import { notificationSchema } from './notification.schema.js';

const VALID_NOTIFICATION = {
  id: '3f6a1c2e-8b9d-4e7f-a0b1-c2d3e4f5a6b7',
  eventType: 'employee.profile.updated',
  title: 'Budi Santoso updated: phone number',
  body: 'Changed fields: phone number.',
  data: { changedFields: ['phoneNumber'] },
  occurredAt: '2026-10-30T02:05:00.000Z',
  createdAt: '2026-10-30T02:05:01.000Z',
  readAt: null,
};

const VALID_REQUEST_NOTIFICATION = {
  id: '3f6a1c2e-8b9d-4e7f-a0b1-c2d3e4f5a6b8',
  eventType: 'attendance.request.submitted',
  title: 'Budi Santoso requested overtime for 2026-10-28',
  body: 'Open the request to review it.',
  data: {
    changedFields: [],
    resourceType: 'overtime_request',
    resourceId: 'e2b1c4a0-7d3e-4b9a-8c1d-0e2f4a6b8c0d',
    businessDate: '2026-10-28',
  },
  occurredAt: '2026-10-30T02:05:00.000Z',
  createdAt: '2026-10-30T02:05:01.000Z',
  readAt: null,
};

describe('notificationSchema', () => {
  it('should accept a pushed notification whose readAt is null', () => {
    expect(notificationSchema.parse(VALID_NOTIFICATION)).toEqual(VALID_NOTIFICATION);
  });

  it('should accept a password notification that names the password field', () => {
    const parsed = notificationSchema.safeParse({
      ...VALID_NOTIFICATION,
      eventType: 'account.password.changed',
      data: { changedFields: ['password'] },
    });

    expect(parsed.success).toBe(true);
  });

  it('should accept an attendance request notification with no changed fields and its resource', () => {
    expect(notificationSchema.parse(VALID_REQUEST_NOTIFICATION)).toEqual(
      VALID_REQUEST_NOTIFICATION,
    );
  });

  it.each(['overtime_request', 'attendance_adjustment_request'])(
    'should accept an attendance request notification for resource type %s',
    (resourceType) => {
      const parsed = notificationSchema.safeParse({
        ...VALID_REQUEST_NOTIFICATION,
        data: { ...VALID_REQUEST_NOTIFICATION.data, resourceType },
      });

      expect(parsed.success).toBe(true);
    },
  );

  it.each([
    {
      condition: 'an unknown key is present',
      extra: { recipientAccountId: '1f2e3d4c-5b6a-4789-8abc-0d1e2f3a4b5c' },
    },
    { condition: 'a password hash key is present', extra: { passwordHash: '$argon2id$v=19' } },
  ])('should reject the notification when $condition', ({ extra }) => {
    expect(notificationSchema.safeParse({ ...VALID_NOTIFICATION, ...extra }).success).toBe(false);
  });

  it.each([
    { condition: 'a reason key is present in data', key: 'reason', value: 'Work late' },
    { condition: 'a reviewReason key is present in data', key: 'reviewReason', value: 'Approved' },
    { condition: 'an oldValues key is present in data', key: 'oldValues', value: {} },
    { condition: 'a newValues key is present in data', key: 'newValues', value: {} },
  ])('should reject the request notification when $condition', ({ key, value }) => {
    const parsed = notificationSchema.safeParse({
      ...VALID_REQUEST_NOTIFICATION,
      data: { ...VALID_REQUEST_NOTIFICATION.data, [key]: value },
    });

    expect(parsed.success).toBe(false);
  });

  it.each([
    { field: 'eventType', value: 'attendance.checked_in.v1' },
    { field: 'eventType', value: 'attendance.request.approved' },
    { field: 'data', value: { changedFields: ['email'] } },
    { field: 'data', value: { changedFields: [], resourceType: 'leave_request' } },
    { field: 'data', value: { changedFields: [], resourceId: 'not-a-uuid' } },
    { field: 'data', value: { changedFields: [], businessDate: '2026-02-30' } },
    { field: 'occurredAt', value: '2026-10-30 02:05:00' },
    { field: 'readAt', value: '2026-10-30T03:00:00+07:00' },
  ])('should reject the notification when $field is not a valid value', ({ field, value }) => {
    expect(notificationSchema.safeParse({ ...VALID_NOTIFICATION, [field]: value }).success).toBe(
      false,
    );
  });
});
