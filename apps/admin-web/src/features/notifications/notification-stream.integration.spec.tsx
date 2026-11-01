import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CURRENT_ACCOUNT_URL,
  HR_ACCOUNT,
  accountCheckSucceeds,
  loginSucceeds,
  renderAdminApp,
  signInWith,
} from '../../test/admin-app-harness.js';
import { mswServer, NOTIFICATION_STREAM_URL } from '../../test/msw-server.js';
import {
  employeeListSucceeds,
  photoThumbnailsSucceeds,
} from '../../test/employee-list-fixtures.js';
import { REQUEST_NOTIFICATION } from '../../test/notification-inbox-fixtures.js';

const NOTIFICATION = {
  id: '3f6c2a10-9b8d-4e7f-8a1b-2c3d4e5f6a7b',
  eventType: 'employee.profile.updated',
  title: 'Budi Santoso updated: phone number',
  body: 'Changed fields: phone number.',
  data: { changedFields: ['phoneNumber'] },
  occurredAt: '2026-11-01T02:00:00.000Z',
  createdAt: '2026-11-01T02:00:01.000Z',
  readAt: null,
};

const LIVE_TIMEOUT_MILLISECONDS = 5_000;
const encoder = new TextEncoder();

// A stream that writes the given frames and then ends, as a proxy or a server-side close would.
function finiteStream(frames: ReadonlyArray<string>) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
}

function eventStreamResponse(body: ReadableStream<Uint8Array>) {
  return new HttpResponse(body, { headers: { 'Content-Type': 'text/event-stream' } });
}

beforeEach(() => {
  mswServer.use(loginSucceeds(), employeeListSucceeds(), photoThumbnailsSucceeds());
});

describe('HR notification stream in the admin app', () => {
  it('should show the toast for a profile change while an HR page is open', async () => {
    const liveEvent = `event: notification\ndata: ${JSON.stringify(NOTIFICATION)}\n\n`;
    mswServer.use(
      http.get(NOTIFICATION_STREAM_URL, () =>
        eventStreamResponse(finiteStream([liveEvent, ': heartbeat\n\n'])),
      ),
    );
    mswServer.use(accountCheckSucceeds());
    const user = userEvent.setup();
    await renderAdminApp('/login');
    await signInWith(user, HR_ACCOUNT.email);

    expect(
      await screen.findByText(NOTIFICATION.title, undefined, {
        timeout: LIVE_TIMEOUT_MILLISECONDS,
      }),
    ).toBeInTheDocument();
  });

  it('should show the toast with the request title for an attendance request while an HR page is open', async () => {
    const liveEvent = `event: notification\ndata: ${JSON.stringify(REQUEST_NOTIFICATION)}\n\n`;
    mswServer.use(
      http.get(NOTIFICATION_STREAM_URL, () =>
        eventStreamResponse(finiteStream([liveEvent, ': heartbeat\n\n'])),
      ),
      accountCheckSucceeds(),
    );
    const user = userEvent.setup();
    await renderAdminApp('/login');
    await signInWith(user, HR_ACCOUNT.email);

    expect(
      await screen.findByText(REQUEST_NOTIFICATION.title, undefined, {
        timeout: LIVE_TIMEOUT_MILLISECONDS,
      }),
    ).toBeInTheDocument();
  });

  it('should send the HR user to login when the reconnect is refused and the session check is refused', async () => {
    let connectionCount = 0;
    let isSessionRevoked = false;
    mswServer.use(
      http.get(NOTIFICATION_STREAM_URL, () => {
        connectionCount += 1;
        if (connectionCount === 1) return eventStreamResponse(finiteStream([': heartbeat\n\n']));
        // The account was deactivated while the stream was down. The stream and the session check both refuse it.
        isSessionRevoked = true;
        return HttpResponse.json(
          { statusCode: 401, code: 'UNAUTHORIZED', message: 'Unauthorized.' },
          { status: 401 },
        );
      }),
      http.get(CURRENT_ACCOUNT_URL, () =>
        isSessionRevoked
          ? HttpResponse.json(
              { statusCode: 401, code: 'UNAUTHORIZED', message: 'Unauthorized.' },
              { status: 401 },
            )
          : HttpResponse.json(HR_ACCOUNT),
      ),
    );
    const user = userEvent.setup();
    await renderAdminApp('/login');
    await signInWith(user, HR_ACCOUNT.email);

    expect(
      await screen.findByRole(
        'heading',
        { level: 1, name: 'HR sign in' },
        { timeout: LIVE_TIMEOUT_MILLISECONDS },
      ),
    ).toBeInTheDocument();
    expect(connectionCount).toBe(2);
  });
});
