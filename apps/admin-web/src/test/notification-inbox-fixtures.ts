import type { Notification, NotificationPage } from '@dexa/contracts';
import { HttpResponse, http, type HttpHandler } from 'msw';

export const NOTIFICATION_INBOX_URL = '/api/v1/notifications';

export const UNREAD_NOTIFICATION: Notification = {
  id: '3f6c2a10-9b8d-4e7f-8a1b-2c3d4e5f6a7b',
  eventType: 'employee.profile.updated',
  title: 'Budi Santoso updated: phone number',
  body: 'Changed fields: phone number.',
  data: { changedFields: ['phoneNumber'] },
  occurredAt: '2026-11-13T02:00:00.000Z',
  createdAt: '2026-11-13T02:00:01.000Z',
  readAt: null,
};

// 13 November 02:00 UTC is 09:00 WIB. The read time is later than the creation time, as the server guarantees.
export const READ_NOTIFICATION: Notification = {
  id: '8d2b7e41-0c3a-4f9e-b5d6-7a8b9c0d1e2f',
  eventType: 'account.password.changed',
  title: 'Rina Kusuma changed their password',
  body: 'Changed fields: password.',
  data: { changedFields: ['password'] },
  occurredAt: '2026-11-12T04:30:00.000Z',
  createdAt: '2026-11-12T04:30:01.000Z',
  readAt: '2026-11-12T05:00:00.000Z',
};

// An attendance request names no changed field. Its body carries no reason, and its resource fields are only data.
export const REQUEST_NOTIFICATION: Notification = {
  id: '6a1f0c3d-2b4e-4f5a-9c7d-8e9f0a1b2c3d',
  eventType: 'attendance.request.submitted',
  title: 'Rina Kusuma requested overtime for 2026-11-12',
  body: 'Open the request to review it.',
  data: {
    changedFields: [],
    resourceType: 'overtime_request',
    resourceId: 'e2b1c4a0-7d3e-4b9a-8c1d-0e2f4a6b8c0d',
    businessDate: '2026-11-12',
  },
  occurredAt: '2026-11-12T06:00:00.000Z',
  createdAt: '2026-11-12T06:00:01.000Z',
  readAt: null,
};

export function buildNotificationPage(options: {
  items: ReadonlyArray<Notification>;
  nextCursor?: string | null;
}): NotificationPage {
  return { items: [...options.items], nextCursor: options.nextCursor ?? null };
}

export function notificationReadUrl(notificationId: string): string {
  return `${NOTIFICATION_INBOX_URL}/${notificationId}/read`;
}

/** Answers the inbox list with the given page, whatever the cursor. */
export function inboxRespondsWith(page: NotificationPage): HttpHandler {
  return http.get(NOTIFICATION_INBOX_URL, () => HttpResponse.json(page));
}
