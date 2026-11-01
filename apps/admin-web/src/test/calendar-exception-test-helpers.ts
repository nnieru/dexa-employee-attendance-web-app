import type { QueryClient } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { mswServer } from './msw-server.js';
import { HR_ACCOUNT, renderAdminApp, signInWith } from './admin-app-harness.js';
import { CALENDAR_EXCEPTIONS_URL, CALENDAR_EXCEPTION_URL } from './calendar-exception-fixtures.js';
import { CALENDAR_SECTION_TITLE } from '../features/schedule/utils/calendar-exception-messages.js';

export type RecordedCalendarWrite = {
  method: 'PUT' | 'DELETE';
  path: string;
  /** The JSON body as sent. Absent for a DELETE. Tests compare it with toEqual, so an extra field fails. */
  body?: unknown;
};

/**
 * Records every save (PUT) and removal (DELETE). `respond` gets the 1-based attempt number, so a test can refuse one
 * attempt and answer the next.
 */
export function recordCalendarWrites(
  respond: (write: RecordedCalendarWrite, attempt: number) => Response | Promise<Response>,
): Array<RecordedCalendarWrite> {
  const writes: Array<RecordedCalendarWrite> = [];
  const record = async (write: RecordedCalendarWrite): Promise<Response> => {
    writes.push(write);
    return respond(write, writes.length);
  };
  mswServer.use(
    http.put(CALENDAR_EXCEPTION_URL, async ({ request }) =>
      record({
        method: 'PUT',
        path: new URL(request.url).pathname,
        body: await request.json(),
      }),
    ),
    http.delete(CALENDAR_EXCEPTION_URL, ({ request }) =>
      record({ method: 'DELETE', path: new URL(request.url).pathname }),
    ),
  );
  return writes;
}

/** Records the query string of every list request, so a test can check the range and page that were sent. */
export function recordCalendarListQueries(
  respond: (query: URLSearchParams) => Response,
): Array<URLSearchParams> {
  const queries: Array<URLSearchParams> = [];
  mswServer.use(
    http.get(CALENDAR_EXCEPTIONS_URL, ({ request }) => {
      const query = new URL(request.url).searchParams;
      queries.push(query);
      return respond(query);
    }),
  );
  return queries;
}

export function answerWithStatus(status: number, code: string, message: string): Response {
  return HttpResponse.json({ statusCode: status, code, message }, { status });
}

/**
 * Signs in and opens the work schedule screen at `path`, which may carry the range in its search string. The calendar
 * heading is static, so tests wait for their own rows.
 */
export async function openCalendarExceptionsPage(path: string, queryClient?: QueryClient) {
  const user = userEvent.setup();
  const router = await renderAdminApp(`/login?redirect=${encodeURIComponent(path)}`, queryClient);
  await signInWith(user, HR_ACCOUNT.email);
  await screen.findByRole('heading', { level: 2, name: CALENDAR_SECTION_TITLE });
  return { user, router };
}
