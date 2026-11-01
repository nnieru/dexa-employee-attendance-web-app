import { describe, expect, it } from 'vitest';
import { parseNotificationEvent } from './parse-notification-event.js';

const VALID_NOTIFICATION = {
  id: '3f6c2a10-9b8d-4e7f-8a1b-2c3d4e5f6a7b',
  eventType: 'employee.profile.updated',
  title: 'Budi Santoso updated: phone number',
  body: 'Changed fields: phone number.',
  data: { changedFields: ['phoneNumber'] },
  occurredAt: '2026-11-01T02:00:00.000Z',
  createdAt: '2026-11-01T02:00:01.000Z',
  readAt: null,
};

describe('parseNotificationEvent', () => {
  it('should return the notification when the data matches the contract', () => {
    expect(parseNotificationEvent(JSON.stringify(VALID_NOTIFICATION))).toEqual(VALID_NOTIFICATION);
  });

  it.each([
    ['not JSON', '{not json'],
    ['an empty string', ''],
    ['an extra key that could carry a secret', { passwordHash: 'x' }],
    ['an unknown event type', { eventType: 'employee.photo.deleted' }],
    ['an unknown changed field', { data: { changedFields: ['salary'] } }],
    ['an empty changed field list', { data: { changedFields: [] } }],
    ['a missing title', { title: undefined }],
    ['a malformed id', { id: 'not-a-uuid' }],
  ])('should return null when the data is %s', (_description, override) => {
    const rawData =
      typeof override === 'string'
        ? override
        : JSON.stringify({ ...VALID_NOTIFICATION, ...override });

    expect(parseNotificationEvent(rawData)).toBeNull();
  });
});
