import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';

export const NOTIFICATION_STREAM_URL = '/api/v1/notifications/stream';
export const NOTIFICATION_UNREAD_COUNT_URL = '/api/v1/notifications/unread-count';

// Shared request mock. Each test adds its own handlers; test-setup resets them after every test.
// Every signed-in screen opens the notification stream, so by default it opens and stays silent. A test that
// needs live events replaces this handler. Every signed-in screen also reads the unread count for the navigation
// badge, so by default it reads zero (no badge). A test that needs a count replaces this handler.
export const mswServer = setupServer(
  http.get(
    NOTIFICATION_STREAM_URL,
    () =>
      new HttpResponse(new ReadableStream(), {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
  ),
  http.get(NOTIFICATION_UNREAD_COUNT_URL, () => HttpResponse.json({ unreadCount: 0 })),
);
