import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import type { SessionState } from '@dexa/session';
import { ToastProvider } from '@dexa/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationQueryKeys } from '../api/notification-query-keys.js';
import { LiveUpdatesStatus } from '../components/live-updates-status.js';
import { NOTIFICATION_STREAM_RECONNECT_BASE_MILLISECONDS } from '../utils/notification-stream.rules.js';
import { useNotificationStream } from './use-notification-stream.js';

const { sessionState, sessionApiClient } = vi.hoisted(() => ({
  sessionState: {
    session: { status: 'signed-in', accessToken: 'access-token-for-tests' } as SessionState,
  },
  // The shared client. Its 401 handler ends the session, so the hook probes the session through it.
  sessionApiClient: { get: vi.fn(async () => ({ data: {} })) },
}));

// Only the session is replaced. The stream itself runs through the real fetch-event-source library.
vi.mock('@dexa/session', () => ({
  useSession: () => ({ session: sessionState.session, apiClient: sessionApiClient }),
}));

const API_BASE_URL = '/api/v1';
const STREAM_URL = '/api/v1/notifications/stream';
const ACCESS_TOKEN = 'access-token-for-tests';
const CURRENT_ACCOUNT_PATH = '/auth/me';
const INTERRUPTED_TEXT = /Live updates are interrupted/;
const UNAVAILABLE_TEXT = /Live updates are unavailable/;
const RECONNECT_DELAYS_MILLISECONDS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000];

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

type FakeStreamRequest = {
  url: string;
  authorization: string | null;
  signal: AbortSignal | null;
};

// Each queued failure answers the next request: an HTTP status, or 'network' for a request that never gets an answer.
type FakeFailure = number | 'network';

/**
 * A fake fetch for the stream. Requests succeed with an open event stream unless a failure is queued. The test
 * writes events into, or ends, the most recent open stream.
 */
function createFakeStreamFetch() {
  const requests: FakeStreamRequest[] = [];
  const openStreams: ReadableStreamDefaultController<Uint8Array>[] = [];
  const queuedFailures: FakeFailure[] = [];
  const encoder = new TextEncoder();

  const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    requests.push({
      url: String(input),
      authorization: headers.get('Authorization'),
      signal: init?.signal ?? null,
    });
    const failure = queuedFailures.shift();
    if (failure === 'network') throw new TypeError('fetch failed');
    if (failure !== undefined) {
      return new Response('{"statusCode":0}', {
        status: failure,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        openStreams.push(controller);
      },
    });
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  });

  function latestStream(): ReadableStreamDefaultController<Uint8Array> {
    const stream = openStreams.at(-1);
    if (stream === undefined) throw new Error('No stream is open.');
    return stream;
  }

  return {
    fakeFetch,
    requests,
    failNextRequestWith(failure: FakeFailure) {
      queuedFailures.push(failure);
    },
    sendEvent(data: string) {
      latestStream().enqueue(encoder.encode(`event: notification\ndata: ${data}\n\n`));
    },
    sendRawLine(line: string) {
      latestStream().enqueue(encoder.encode(line));
    },
    endLatestStream() {
      latestStream().close();
    },
  };
}

function renderNotificationStream() {
  const queryClient = new QueryClient();
  function NotificationStreamHarness() {
    const state = useNotificationStream({ apiBaseUrl: API_BASE_URL });
    return <LiveUpdatesStatus state={state} />;
  }
  function renderTree() {
    return (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <NotificationStreamHarness />
        </ToastProvider>
      </QueryClientProvider>
    );
  }
  const { unmount, rerender } = render(renderTree());
  return {
    queryClient,
    unmount,
    endSession() {
      sessionState.session = { status: 'signed-out', endReason: null };
      rerender(renderTree());
    },
  };
}

// Lets the library read the stream and schedule its next attempt.
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function advanceTime(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

describe('useNotificationStream', () => {
  let stream: ReturnType<typeof createFakeStreamFetch>;

  beforeEach(() => {
    vi.useFakeTimers();
    sessionState.session = { status: 'signed-in', accessToken: ACCESS_TOKEN };
    sessionApiClient.get.mockClear();
    stream = createFakeStreamFetch();
    vi.stubGlobal('fetch', stream.fakeFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('should show a toast with the notification title when a valid notification arrives', async () => {
    renderNotificationStream();
    await settle();

    stream.sendEvent(JSON.stringify(NOTIFICATION));
    await settle();

    expect(screen.getByText(NOTIFICATION.title)).toBeInTheDocument();
  });

  it('should send the access token in the Bearer header and never in the URL', async () => {
    renderNotificationStream();
    await settle();

    expect(stream.requests[0]?.url).toBe(STREAM_URL);
    expect(stream.requests[0]?.authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
  });

  it('should ignore a payload that fails the contract without a toast or an inbox refresh', async () => {
    const { queryClient } = renderNotificationStream();
    await settle();
    const inboxKey = notificationQueryKeys.inbox();
    queryClient.setQueryData(inboxKey, { items: [] });

    stream.sendEvent('{not json');
    stream.sendEvent(JSON.stringify({ ...NOTIFICATION, passwordHash: 'value-that-must-not-pass' }));
    await settle();

    expect(screen.queryByText(NOTIFICATION.title)).not.toBeInTheDocument();
    expect(queryClient.getQueryState(inboxKey)?.isInvalidated).toBe(false);
  });

  it('should keep receiving events after an invalid payload', async () => {
    renderNotificationStream();
    await settle();

    stream.sendEvent('{not json');
    stream.sendEvent(JSON.stringify(NOTIFICATION));
    await settle();

    expect(screen.getByText(NOTIFICATION.title)).toBeInTheDocument();
  });

  it('should ignore events with another event name', async () => {
    renderNotificationStream();
    await settle();

    stream.sendRawLine(`event: heartbeat\ndata: ${JSON.stringify(NOTIFICATION)}\n\n`);
    await settle();

    expect(screen.queryByText(NOTIFICATION.title)).not.toBeInTheDocument();
  });

  it('should invalidate the inbox and unread count queries when a valid notification arrives', async () => {
    const { queryClient } = renderNotificationStream();
    await settle();
    const inboxKey = notificationQueryKeys.inbox();
    const unreadCountKey = notificationQueryKeys.unreadCount();
    queryClient.setQueryData(inboxKey, { items: [] });
    queryClient.setQueryData(unreadCountKey, { unreadCount: 0 });

    stream.sendEvent(JSON.stringify(NOTIFICATION));
    await settle();

    expect(queryClient.getQueryState(inboxKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(unreadCountKey)?.isInvalidated).toBe(true);
  });

  it('should show the interrupted status when the stream drops and clear it on reconnect', async () => {
    renderNotificationStream();
    await settle();
    expect(screen.queryByText(INTERRUPTED_TEXT)).not.toBeInTheDocument();

    stream.endLatestStream();
    await settle();
    expect(screen.getByText(INTERRUPTED_TEXT)).toBeInTheDocument();

    await advanceTime(NOTIFICATION_STREAM_RECONNECT_BASE_MILLISECONDS);
    expect(stream.requests).toHaveLength(2);
    expect(screen.queryByText(INTERRUPTED_TEXT)).not.toBeInTheDocument();
  });

  it('should refresh the inbox and unread count queries when the stream reconnects', async () => {
    const { queryClient } = renderNotificationStream();
    await settle();
    const inboxKey = notificationQueryKeys.inbox();
    queryClient.setQueryData(inboxKey, { items: [] });

    stream.endLatestStream();
    await settle();
    expect(queryClient.getQueryState(inboxKey)?.isInvalidated).toBe(false);
    await advanceTime(NOTIFICATION_STREAM_RECONNECT_BASE_MILLISECONDS);

    expect(queryClient.getQueryState(inboxKey)?.isInvalidated).toBe(true);
  });

  it('should show the interrupted status while the gateway is unreachable', async () => {
    stream.failNextRequestWith('network');
    renderNotificationStream();
    await settle();

    expect(screen.getByText(INTERRUPTED_TEXT)).toBeInTheDocument();
  });

  it('should reconnect with exponential backoff capped at the maximum delay', async () => {
    renderNotificationStream();
    await settle();
    for (let failure = 0; failure < RECONNECT_DELAYS_MILLISECONDS.length; failure += 1) {
      stream.failNextRequestWith(503);
    }
    stream.endLatestStream();
    await settle();

    for (const [attemptIndex, delay] of RECONNECT_DELAYS_MILLISECONDS.entries()) {
      const requestCountBeforeDelay = stream.requests.length;
      await advanceTime(delay - 1);
      expect(stream.requests).toHaveLength(requestCountBeforeDelay);
      await advanceTime(1);
      expect(stream.requests).toHaveLength(requestCountBeforeDelay + 1);
      expect(stream.requests.at(-1)?.url, `attempt ${attemptIndex}`).toBe(STREAM_URL);
    }
  });

  it('should start the backoff again from the base delay after a successful reconnect', async () => {
    renderNotificationStream();
    await settle();
    stream.failNextRequestWith(503);
    stream.failNextRequestWith(503);
    stream.endLatestStream();
    await settle();
    // Two failed attempts (1 s, then 2 s), then the third attempt connects.
    await advanceTime(1_000);
    await advanceTime(2_000);
    await advanceTime(4_000);
    expect(stream.requests).toHaveLength(4);

    stream.endLatestStream();
    await settle();
    // Without a reset the next delay would be 8 s, not the base delay.
    await advanceTime(NOTIFICATION_STREAM_RECONNECT_BASE_MILLISECONDS - 1);
    expect(stream.requests).toHaveLength(4);
    await advanceTime(1);

    expect(stream.requests).toHaveLength(5);
  });

  it('should stop without retrying when the stream answers 401', async () => {
    stream.failNextRequestWith(401);
    renderNotificationStream();
    await settle();

    expect(screen.getByText(UNAVAILABLE_TEXT)).toBeInTheDocument();
    await advanceTime(10 * 60_000);
    expect(stream.requests).toHaveLength(1);
  });

  it('should check the session through the shared client when the stream answers 401', async () => {
    stream.failNextRequestWith(401);
    renderNotificationStream();
    await settle();

    expect(sessionApiClient.get).toHaveBeenCalledTimes(1);
    expect(sessionApiClient.get).toHaveBeenCalledWith(CURRENT_ACCOUNT_PATH);
  });

  it('should stop without retrying or checking the session when the stream answers 403', async () => {
    stream.failNextRequestWith(403);
    renderNotificationStream();
    await settle();

    expect(screen.getByText(UNAVAILABLE_TEXT)).toBeInTheDocument();
    await advanceTime(10 * 60_000);
    expect(stream.requests).toHaveLength(1);
    expect(sessionApiClient.get).not.toHaveBeenCalled();
  });

  it('should abort the stream when the component unmounts', async () => {
    const { unmount } = renderNotificationStream();
    await settle();
    const openedSignal = stream.requests[0]?.signal;

    unmount();
    await advanceTime(10 * 60_000);

    expect(openedSignal?.aborted).toBe(true);
    expect(stream.requests).toHaveLength(1);
  });

  it('should abort the stream and not reconnect when the session ends', async () => {
    const { endSession } = renderNotificationStream();
    await settle();
    const openedSignal = stream.requests[0]?.signal;

    endSession();
    await settle();
    await advanceTime(10 * 60_000);

    expect(openedSignal?.aborted).toBe(true);
    expect(stream.requests).toHaveLength(1);
  });
});
