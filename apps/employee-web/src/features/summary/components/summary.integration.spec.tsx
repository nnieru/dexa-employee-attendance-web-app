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
  dayStatus: 'PRESENT',
  approvedOvertimeMinutes: 0,
  clockInAt: '2026-11-13T01:02:00.000Z',
  clockInStatus: 'ON_TIME_CHECKIN',
  clockOutAt: '2026-11-13T11:30:00.000Z',
  clockOutStatus: 'LATE_CHECKOUT',
};
const CLOCK_IN_ONLY_DAY: AttendanceSummaryItem = {
  businessDate: '2026-11-14',
  dayStatus: 'PRESENT',
  approvedOvertimeMinutes: 0,
  clockInAt: '2026-11-14T02:20:00.000Z',
  clockInStatus: 'LATE_CHECKIN',
  clockOutAt: null,
  clockOutStatus: 'PENDING_CHECKOUT',
};
const DAY_OFF: AttendanceSummaryItem = {
  businessDate: '2026-11-07',
  dayStatus: 'DAY_OFF',
  approvedOvertimeMinutes: 0,
  clockInAt: '2026-11-07T01:00:00.000Z',
  clockInStatus: 'CHECKIN_NOT_REQUIRED',
  clockOutAt: '2026-11-07T10:00:00.000Z',
  clockOutStatus: 'CHECKOUT_NOT_REQUIRED',
};
const EARLY_DAY: AttendanceSummaryItem = {
  businessDate: '2026-11-12',
  dayStatus: 'PRESENT',
  approvedOvertimeMinutes: 0,
  clockInAt: '2026-11-12T00:45:00.000Z',
  clockInStatus: 'EARLY_CHECKIN',
  clockOutAt: '2026-11-12T10:00:00.000Z',
  clockOutStatus: 'EARLY_CHECKOUT',
};
// A request created these days with no punch, so neither has a clock-in time.
const REQUEST_WORKING_DAY_NO_CHECK_IN: AttendanceSummaryItem = {
  businessDate: '2026-11-10',
  dayStatus: 'PENDING',
  approvedOvertimeMinutes: 0,
  clockInAt: null,
  clockInStatus: 'PENDING_CHECKIN',
  clockOutAt: null,
  clockOutStatus: 'PENDING_CHECKOUT',
};
const REQUEST_DAY_OFF_NO_CHECK_IN: AttendanceSummaryItem = {
  businessDate: '2026-11-08',
  dayStatus: 'DAY_OFF',
  approvedOvertimeMinutes: 0,
  clockInAt: null,
  clockInStatus: 'CHECKIN_NOT_REQUIRED',
  clockOutAt: null,
  clockOutStatus: 'CHECKOUT_NOT_REQUIRED',
};
// A punched day whose effective times came from an approved correction; the row shows those times and their labels.
const CORRECTED_DAY: AttendanceSummaryItem = {
  businessDate: '2026-11-11',
  dayStatus: 'PRESENT',
  approvedOvertimeMinutes: 150,
  clockInAt: '2026-11-11T01:58:00.000Z',
  clockInStatus: 'ON_TIME_CHECKIN',
  clockOutAt: '2026-11-11T13:30:00.000Z',
  clockOutStatus: 'LATE_CHECKOUT',
};
const FRACTIONAL_OVERTIME_DAY: AttendanceSummaryItem = {
  businessDate: '2026-11-09',
  dayStatus: 'PRESENT',
  approvedOvertimeMinutes: 90.5,
  clockInAt: '2026-11-09T02:00:00.000Z',
  clockInStatus: 'ON_TIME_CHECKIN',
  clockOutAt: '2026-11-09T12:00:00.000Z',
  clockOutStatus: 'LATE_CHECKOUT',
};
// SICK_LEAVE and LEAVE days have no effective punches, so both timing statuses are the not-required codes.
const SICK_LEAVE_DAY: AttendanceSummaryItem = {
  businessDate: '2026-11-05',
  dayStatus: 'SICK_LEAVE',
  approvedOvertimeMinutes: 0,
  clockInAt: null,
  clockInStatus: 'CHECKIN_NOT_REQUIRED',
  clockOutAt: null,
  clockOutStatus: 'CHECKOUT_NOT_REQUIRED',
};
const LEAVE_DAY: AttendanceSummaryItem = {
  businessDate: '2026-11-04',
  dayStatus: 'LEAVE',
  approvedOvertimeMinutes: 0,
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
      'Present',
      '2026-11-14 09:20',
      'Late clock-in',
      '',
      'Not recorded yet',
      '—',
      'Request a correction',
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
    ).toEqual([
      '2026-11-10',
      'Pending',
      '',
      'Not recorded yet',
      '',
      'Not recorded yet',
      '—',
      'Request a correction',
    ]);
    const dayOffRow = screen.getByRole('cell', { name: '2026-11-08' }).closest('tr');
    expect(dayOffRow).not.toBeNull();
    expect(
      within(dayOffRow as HTMLElement)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual([
      '2026-11-08',
      'Day off',
      '',
      'Not required',
      '',
      'Not required',
      '—',
      'Request a correction',
    ]);
  });

  it('should show Day status and Approved overtime after the clock-out status, with Action last', async () => {
    mswServer.use(summaryEndpoint(() => HttpResponse.json(summaryPage([ON_TIME_DAY]))).handler);
    await openHistoryAt('/history');

    const headers = await screen.findAllByRole('columnheader');
    expect(headers.map((header) => header.textContent)).toEqual([
      'Date',
      'Day status',
      'Clock in',
      'Clock-in status',
      'Clock out',
      'Clock-out status',
      'Approved overtime',
      'Action',
    ]);
  });

  it('should show the effective times and the overtime for a day corrected to present', async () => {
    mswServer.use(summaryEndpoint(() => HttpResponse.json(summaryPage([CORRECTED_DAY]))).handler);
    await openHistoryAt('/history');

    const row = (await screen.findByRole('cell', { name: '2026-11-11' })).closest('tr');
    expect(row).not.toBeNull();
    expect(
      within(row as HTMLElement)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual([
      '2026-11-11',
      'Present',
      '2026-11-11 08:58',
      'On-time clock-in',
      '2026-11-11 20:30',
      'Late clock-out',
      '2h 30m',
      'Request a correction',
    ]);
  });

  it('should round fractional approved overtime to the nearest whole minute for display', async () => {
    mswServer.use(
      summaryEndpoint(() => HttpResponse.json(summaryPage([FRACTIONAL_OVERTIME_DAY]))).handler,
    );
    await openHistoryAt('/history');

    const row = (await screen.findByRole('cell', { name: '2026-11-09' })).closest('tr');
    expect(within(row as HTMLElement).getByRole('cell', { name: '1h 31m' })).toBeInTheDocument();
  });

  it('should show empty times and Not required in both status columns for a sick leave day', async () => {
    mswServer.use(summaryEndpoint(() => HttpResponse.json(summaryPage([SICK_LEAVE_DAY]))).handler);
    await openHistoryAt('/history');

    const row = (await screen.findByRole('cell', { name: '2026-11-05' })).closest('tr');
    expect(row).not.toBeNull();
    expect(
      within(row as HTMLElement)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual([
      '2026-11-05',
      'Sick leave',
      '',
      'Not required',
      '',
      'Not required',
      '—',
      'Request a correction',
    ]);
    expect(
      within(row as HTMLElement).getByRole('link', { name: 'Request a correction for 2026-11-05' }),
    ).toBeInTheDocument();
  });

  it('should show empty times and Not required in both status columns for a leave day', async () => {
    mswServer.use(summaryEndpoint(() => HttpResponse.json(summaryPage([LEAVE_DAY]))).handler);
    await openHistoryAt('/history');

    const row = (await screen.findByRole('cell', { name: '2026-11-04' })).closest('tr');
    expect(row).not.toBeNull();
    expect(
      within(row as HTMLElement)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual([
      '2026-11-04',
      'Leave',
      '',
      'Not required',
      '',
      'Not required',
      '—',
      'Request a correction',
    ]);
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

describe('summary correction link', () => {
  it('should show an Action column whose link names the day and points at the correction form with that date', async () => {
    mswServer.use(summaryEndpoint().handler);
    await openHistoryAt('/history');

    expect(await screen.findByRole('columnheader', { name: 'Action' })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Request a correction for 2026-11-13' });
    expect(link).toHaveAttribute('href', '/requests/corrections/new?date=2026-11-13');
  });

  it('should show no correction link for a day older than the 30-day window in WIB', async () => {
    // 2026-10-16 is the oldest day a correction can target from 2026-11-15 (30 days back); 2026-10-15 is one day too old.
    const outsideWindow = { ...ON_TIME_DAY, businessDate: '2026-10-15' };
    const insideWindow = { ...ON_TIME_DAY, businessDate: '2026-10-16' };
    mswServer.use(
      summaryEndpoint(() => HttpResponse.json(summaryPage([insideWindow, outsideWindow]))).handler,
    );
    await openHistoryAt('/history');

    await screen.findByRole('cell', { name: '2026-10-15' });
    expect(
      screen.getByRole('link', { name: 'Request a correction for 2026-10-16' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Request a correction for 2026-10-15' }),
    ).not.toBeInTheDocument();
  });

  it('should open the correction form with the day pre-filled when the row link is pressed', async () => {
    mswServer.use(summaryEndpoint().handler);
    const { user, router } = await openHistoryAt('/history');

    await user.click(
      await screen.findByRole('link', { name: 'Request a correction for 2026-11-13' }),
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Request correction' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/requests/corrections/new');
    expect(router.state.location.search).toEqual({ date: '2026-11-13' });
    expect(screen.getByLabelText('Business date')).toHaveValue('2026-11-13');
  });
});
