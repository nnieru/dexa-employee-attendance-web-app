import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { mswServer } from './msw-server.js';
import { HR_ACCOUNT, renderAdminApp, signInWith } from './admin-app-harness.js';
import {
  ATTENDANCE_MONITORING_URL,
  buildAttendanceMonitoringPage,
} from './attendance-monitoring-fixtures.js';

/**
 * Records the query of every monitoring request. `respond` gets the query and the zero-based request index, so a test
 * can fail one request and answer the retry.
 */
export function recordAttendanceRequests(
  respond: (query: URLSearchParams, requestIndex: number) => Response,
): Array<URLSearchParams> {
  const requestQueries: Array<URLSearchParams> = [];
  mswServer.use(
    http.get(ATTENDANCE_MONITORING_URL, ({ request }) => {
      const query = new URL(request.url).searchParams;
      requestQueries.push(query);
      return respond(query, requestQueries.length - 1);
    }),
  );
  return requestQueries;
}

export function answerWithAttendancePage(
  options: Parameters<typeof buildAttendanceMonitoringPage>[0],
): Response {
  return HttpResponse.json(buildAttendanceMonitoringPage(options));
}

/** Signs in and lands on `path`, so the first request is driven by the URL the page opened with. */
export async function openAttendancePage(path: string) {
  const user = userEvent.setup();
  const router = await renderAdminApp(`/login?redirect=${encodeURIComponent(path)}`);
  await signInWith(user, HR_ACCOUNT.email);
  await screen.findByRole('heading', { level: 1, name: 'Attendance' });
  return { user, router };
}

export function getRowForDate(businessDate: string): HTMLElement {
  return screen.getByRole('row', { name: new RegExp(businessDate) });
}

export function getEmployeeSelect(): HTMLElement {
  return screen.getByRole('combobox', { name: 'Employee' });
}
