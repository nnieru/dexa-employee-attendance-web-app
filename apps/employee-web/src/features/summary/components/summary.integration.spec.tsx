import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AttendanceSummaryItem } from '@dexa/contracts';
import { mswServer } from '../../../test/msw-server.js';
import {
  EMPLOYEE_ACCOUNT,
  accountCheckSucceeds,
  loginSucceeds,
  renderEmployeeApp,
  signInWith,
} from '../../../test/employee-app-harness.js';
import { getSummaryEmptyMessage, SUMMARY_LOAD_ERROR_MESSAGE } from '../utils/summary-messages.js';
import { RANGE_ORDER_MESSAGE } from '../utils/summary-range.js';

const SUMMARY_URL = '/api/v1/attendance/me';
// 20:00 UTC on 14 November is 03:00 WIB on 15 November: the WIB date is ahead of the UTC date.
const NOW_IN_WIB_TODAY_15_NOVEMBER = new Date('2026-11-14T20:00:00.000Z');
const DEFAULT_QUERY = { from: '2026-11-01', to: '2026-11-15', page: '1', pageSize: '20' };

const ON_TIME_DAY: AttendanceSummaryItem = {
  businessDate: '2026-11-13',
  clockInAt: '2026-11-13T01:02:00.000Z',
  clockInStatus: 'ON_TIME_CHECKIN',
  clockOutAt: '2026-11-13T11:30:00.000Z',
  clockOutStatus: 'LATE_CHECKOUT',
};
const CLOCK_IN_ONLY_DAY: AttendanceSummaryItem = {
  businessDate: '2026-11-14',
  clockInAt: '2026-11-14T02:20:00.000Z',
  clockInStatus: 'LATE_CHECKIN',
  clockOutAt: null,
  clockOutStatus: 'PENDING_CHECKOUT',
};
const DAY_OFF: AttendanceSummaryItem = {
  businessDate: '2026-11-07',
  clockInAt: '2026-11-07T01:00:00.000Z',
  clockInStatus: 'CHECKIN_NOT_REQUIRED',
  clockOutAt: '2026-11-07T10:00:00.000Z',
  clockOutStatus: 'CHECKOUT_NOT_REQUIRED',
};
const EARLY_DAY: AttendanceSummaryItem = {
  businessDate: '2026-11-12',
  clockInAt: '2026-11-12T00:45:00.000Z',
  clockInStatus: 'EARLY_CHECKIN',
  clockOutAt: '2026-11-12T10:00:00.000Z',
  clockOutStatus: 'EARLY_CHECKOUT',
};
// A request created these days with no punch, so neither has a clock-in time (D-59).
const REQUEST_WORKING_DAY_NO_CHECK_IN: AttendanceSummaryItem = {
  businessDate: '2026-11-10',
  clockInAt: null,
  clockInStatus: 'PENDING_CHECKIN',
  clockOutAt: null,
  clockOutStatus: 'PENDING_CHECKOUT',
};
const REQUEST_DAY_OFF_NO_CHECK_IN: AttendanceSummaryItem = {
  businessDate: '2026-11-08',
  clockInAt: null,
  clockInStatus: 'CHECKIN_NOT_REQUIRED',
  clockOutAt: null,
  clockOutStatus: 'CHECKOUT_NOT_REQUIRED',
};

function summaryPage(
  items: ReadonlyArray<AttendanceSummaryItem>,
  overrides: { totalItems?: number; totalPages?: number } = {},
) {
  return {
    items,
    page: 1,
    pageSize: 20,
    totalItems: overrides.totalItems ?? items.length,
    totalPages: overrides.totalPages ?? 1,
  };
}

/** Answers every summary request and keeps each request's query, so a test can assert what was asked for. */
function summaryEndpoint(
  respond: (query: URLSearchParams) => Response = () =>
    HttpResponse.json(summaryPage([ON_TIME_DAY, CLOCK_IN_ONLY_DAY])),
) {
  const requestedQueries: URLSearchParams[] = [];
  return {
    requestedQueries,
    handler: http.get(SUMMARY_URL, ({ request }) => {
      const query = new URL(request.url).searchParams;
      requestedQueries.push(query);
      return respond(query);
    }),
  };
}

/** The query of the nth request, failing the test clearly when the request was never made. */
function requestAt(
  requestedQueries: ReadonlyArray<URLSearchParams>,
  index: number,
): URLSearchParams {
  const query = requestedQueries[index];
  if (query === undefined) throw new Error(`No summary request at index ${index}.`);
  return query;
}

function queryAsObject(query: URLSearchParams): Record<string, string> {
  return Object.fromEntries(query.entries());
}

/** Signs in and lands on History with the given path, through the login redirect the app uses for protected pages. */
async function openHistoryAt(path: string) {
  const user = userEvent.setup();
  const router = await renderEmployeeApp(`/login?redirect=${encodeURIComponent(path)}`);
  await signInWith(user, EMPLOYEE_ACCOUNT.email);
  await screen.findByRole('heading', { level: 1, name: 'History' });
  return { user, router };
}

function setDateField(label: 'From' | 'To', value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW_IN_WIB_TODAY_15_NOVEMBER);
  mswServer.use(loginSucceeds(), accountCheckSucceeds());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('summary request and range', () => {
  it('should request the first of the WIB month through today when the URL has no range', async () => {
    const summary = summaryEndpoint();
    mswServer.use(summary.handler);

    await openHistoryAt('/history');

    await screen.findByRole('cell', { name: '2026-11-14' });
    expect(queryAsObject(requestAt(summary.requestedQueries, 0))).toEqual(DEFAULT_QUERY);
  });

  it('should show a validation message and send no request when From is after To', async () => {
    const summary = summaryEndpoint();
    mswServer.use(summary.handler);
    const { user, router } = await openHistoryAt('/history');
    await screen.findByRole('cell', { name: '2026-11-14' });

    setDateField('From', '2026-11-20');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByText(RANGE_ORDER_MESSAGE)).toBeInTheDocument();
    expect(summary.requestedQueries).toHaveLength(1);
    expect(router.state.location.pathname).toBe('/history');
    expect(router.state.location.search).toEqual({ from: '2026-11-01', to: '2026-11-15', page: 1 });
  });

  it('should update the URL and request the chosen range when Search is pressed', async () => {
    const summary = summaryEndpoint();
    mswServer.use(summary.handler);
    const { user, router } = await openHistoryAt('/history');
    await screen.findByRole('cell', { name: '2026-11-14' });

    setDateField('From', '2026-10-01');
    setDateField('To', '2026-10-31');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await vi.waitFor(() => {
      expect(summary.requestedQueries).toHaveLength(2);
    });
    expect(queryAsObject(requestAt(summary.requestedQueries, 1))).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
      page: '1',
      pageSize: '20',
    });
    expect(router.state.location.search).toEqual({ from: '2026-10-01', to: '2026-10-31', page: 1 });
  });

  it('should fill the range ending today and search it when the 1 month preset is chosen', async () => {
    const summary = summaryEndpoint();
    mswServer.use(summary.handler);
    const { user } = await openHistoryAt('/history');
    await screen.findByRole('cell', { name: '2026-11-14' });

    await user.click(screen.getByRole('button', { name: '1 month' }));
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await vi.waitFor(() => {
      expect(summary.requestedQueries).toHaveLength(2);
    });
    expect(queryAsObject(requestAt(summary.requestedQueries, 1))).toMatchObject({
      from: '2026-10-16',
      to: '2026-11-15',
    });
  });

  it('should request the page the URL names', async () => {
    const summary = summaryEndpoint();
    mswServer.use(summary.handler);

    await openHistoryAt('/history?page=3');

    await screen.findByRole('cell', { name: '2026-11-14' });
    expect(requestAt(summary.requestedQueries, 0).get('page')).toBe('3');
  });
});

describe('summary table', () => {
  it('should show times as YYYY-MM-DD HH:mm in WIB and leave Clock out empty when no check-out is recorded', async () => {
    mswServer.use(summaryEndpoint().handler);
    await openHistoryAt('/history');

    const clockInOnlyRow = (await screen.findByRole('cell', { name: '2026-11-14' })).closest('tr');
    expect(clockInOnlyRow).not.toBeNull();
    const cells = within(clockInOnlyRow as HTMLElement).getAllByRole('cell');
    expect(cells.map((cell) => cell.textContent)).toEqual([
      '2026-11-14',
      '2026-11-14 09:20',
      'Late clock-in',
      '',
      'Not recorded yet',
    ]);
    const onTimeRow = screen.getByRole('cell', { name: '2026-11-13' }).closest('tr') as HTMLElement;
    expect(within(onTimeRow).getByRole('cell', { name: '2026-11-13 18:30' })).toBeInTheDocument();
  });

  it('should show the DESIGN §8 classification labels for each check-in and check-out', async () => {
    mswServer.use(
      summaryEndpoint(() =>
        HttpResponse.json(summaryPage([ON_TIME_DAY, CLOCK_IN_ONLY_DAY, DAY_OFF, EARLY_DAY])),
      ).handler,
    );
    await openHistoryAt('/history');

    await screen.findByRole('cell', { name: '2026-11-13' });
    expect(screen.getByText('On-time clock-in')).toBeInTheDocument();
    expect(screen.getByText('Late clock-in')).toBeInTheDocument();
    expect(screen.getByText('Early clock-in')).toBeInTheDocument();
    expect(screen.getByText('Late clock-out')).toBeInTheDocument();
    expect(screen.getByText('Early clock-out')).toBeInTheDocument();
    expect(screen.getByText('Not recorded yet')).toBeInTheDocument();
    expect(screen.getAllByText('Not required')).toHaveLength(2);
  });

  it('should leave the Clock in cell empty and show the stored statuses for a request-created day with no check-in', async () => {
    mswServer.use(
      summaryEndpoint(() =>
        HttpResponse.json(
          summaryPage([REQUEST_WORKING_DAY_NO_CHECK_IN, REQUEST_DAY_OFF_NO_CHECK_IN]),
        ),
      ).handler,
    );
    await openHistoryAt('/history');

    const workingDayRow = (await screen.findByRole('cell', { name: '2026-11-10' })).closest('tr');
    expect(workingDayRow).not.toBeNull();
    expect(
      within(workingDayRow as HTMLElement)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['2026-11-10', '', 'Not recorded yet', '', 'Not recorded yet']);
    const dayOffRow = screen.getByRole('cell', { name: '2026-11-08' }).closest('tr');
    expect(dayOffRow).not.toBeNull();
    expect(
      within(dayOffRow as HTMLElement)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['2026-11-08', '', 'Not required', '', 'Not required']);
  });

  it('should show the empty message with the range when no attendance was recorded', async () => {
    mswServer.use(summaryEndpoint(() => HttpResponse.json(summaryPage([]))).handler);
    await openHistoryAt('/history');

    expect(
      await screen.findByText(getSummaryEmptyMessage({ from: '2026-11-01', to: '2026-11-15' })),
    ).toBeInTheDocument();
  });

  it('should show a loading message until the first page arrives', async () => {
    let releaseResponse: () => void = () => undefined;
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    mswServer.use(
      http.get(SUMMARY_URL, async () => {
        await responseGate;
        return HttpResponse.json(summaryPage([ON_TIME_DAY]));
      }),
    );
    await openHistoryAt('/history');

    expect(await screen.findByText('Loading records…')).toBeInTheDocument();
    await act(async () => {
      releaseResponse();
    });
    expect(await screen.findByRole('cell', { name: '2026-11-13' })).toBeInTheDocument();
  });

  it('should show the error with Try again and load the page on retry', async () => {
    let isFirstRequest = true;
    const summary = summaryEndpoint(() => {
      const shouldFail = isFirstRequest;
      isFirstRequest = false;
      if (shouldFail) {
        return HttpResponse.json(
          { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Failed.' },
          { status: 500 },
        );
      }
      return HttpResponse.json(summaryPage([ON_TIME_DAY]));
    });
    mswServer.use(summary.handler);
    const { user } = await openHistoryAt('/history');

    expect(await screen.findByText(SUMMARY_LOAD_ERROR_MESSAGE)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('cell', { name: '2026-11-13' })).toBeInTheDocument();
    expect(summary.requestedQueries).toHaveLength(2);
  });

  it('should request the next page with the URL updated when Next is pressed', async () => {
    const summary = summaryEndpoint(() =>
      HttpResponse.json(summaryPage([ON_TIME_DAY], { totalItems: 21, totalPages: 2 })),
    );
    mswServer.use(summary.handler);
    const { user, router } = await openHistoryAt('/history');
    await screen.findByRole('cell', { name: '2026-11-13' });

    await user.click(screen.getByRole('button', { name: 'Next page' }));

    await vi.waitFor(() => {
      expect(summary.requestedQueries).toHaveLength(2);
    });
    expect(requestAt(summary.requestedQueries, 1).get('page')).toBe('2');
    expect(router.state.location.search).toMatchObject({ page: 2 });
  });
});
