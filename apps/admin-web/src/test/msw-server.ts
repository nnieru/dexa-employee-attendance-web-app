import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import {
  CALENDAR_EXCEPTIONS_URL,
  buildCalendarExceptionPage,
} from './calendar-exception-fixtures.js';

export const NOTIFICATION_STREAM_URL = '/api/v1/notifications/stream';
export const NOTIFICATION_UNREAD_COUNT_URL = '/api/v1/notifications/unread-count';

// Shared request mock. Each test adds its own handlers; test-setup resets them after every test.
// Every signed-in screen opens the notification stream, so by default it opens and stays silent. A test that
// needs live events replaces this handler. Every signed-in screen also reads the unread count for the navigation
// badge, so by default it reads zero (no badge). A test that needs a count replaces this handler.
// The work schedule screen also lists calendar exceptions, so by default that list is empty.
export const mswServer = setupServer(
  http.get(
    NOTIFICATION_STREAM_URL,
    () =>
      new HttpResponse(new ReadableStream(), {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
  ),
  http.get(NOTIFICATION_UNREAD_COUNT_URL, () => HttpResponse.json({ unreadCount: 0 })),
  http.get(CALENDAR_EXCEPTIONS_URL, () => HttpResponse.json(buildCalendarExceptionPage([]))),
);
