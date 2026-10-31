import {
  NOTIFICATION_CURSOR_MAX_LENGTH,
  notificationIdParamSchema,
  notificationListQuerySchema,
  notificationPageSchema,
  notificationUnreadCountSchema,
} from './notification-inbox.schema.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../pagination/pagination.schema.js';

const NOTIFICATION = {
  id: '3f6a1c2e-8b9d-4e7f-a0b1-c2d3e4f5a6b7',
  eventType: 'employee.profile.updated',
  title: 'Budi Santoso updated: phone number',
  body: 'Changed fields: phone number.',
  data: { changedFields: ['phoneNumber'] },
  occurredAt: '2026-10-30T02:05:00.000Z',
  createdAt: '2026-10-30T02:05:01.000Z',
  readAt: null,
};

describe('notificationListQuerySchema', () => {
  it('should apply the default limit and no cursor when the query is empty', () => {
    expect(notificationListQuerySchema.parse({})).toEqual({ limit: DEFAULT_PAGE_SIZE });
  });

  it('should coerce the limit when it arrives as a string', () => {
    expect(notificationListQuerySchema.parse({ limit: '50', cursor: 'abc' })).toEqual({
      limit: 50,
      cursor: 'abc',
    });
  });

  it.each([
    { condition: 'limit is 0', query: { limit: '0' } },
    { condition: 'limit is above the maximum', query: { limit: String(MAX_PAGE_SIZE + 1) } },
    { condition: 'limit is not a whole number', query: { limit: '2.5' } },
    { condition: 'cursor is empty', query: { cursor: '' } },
    {
      condition: 'cursor is above the maximum length',
      query: { cursor: 'a'.repeat(NOTIFICATION_CURSOR_MAX_LENGTH + 1) },
    },
    { condition: 'a page number is sent', query: { page: '2' } },
    { condition: 'an unknown key is sent', query: { sort: 'name' } },
  ])('should refuse the query when $condition', ({ query }) => {
    expect(notificationListQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('notificationPageSchema', () => {
  it('should accept a page whose last item has a null next cursor', () => {
    expect(notificationPageSchema.parse({ items: [NOTIFICATION], nextCursor: null }).items).toEqual(
      [NOTIFICATION],
    );
  });

  it('should refuse a page with an extra key', () => {
    const parsed = notificationPageSchema.safeParse({
      items: [],
      nextCursor: null,
      totalItems: 0,
    });

    expect(parsed.success).toBe(false);
  });
});

describe('notificationUnreadCountSchema', () => {
  it.each([
    { condition: 'the count is negative', value: { unreadCount: -1 } },
    { condition: 'the count is not an integer', value: { unreadCount: 1.5 } },
  ])('should refuse the count when $condition', ({ value }) => {
    expect(notificationUnreadCountSchema.safeParse(value).success).toBe(false);
  });
});

describe('notificationIdParamSchema', () => {
  it('should refuse an id that is not a UUID', () => {
    expect(notificationIdParamSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false);
  });
});
