import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mswServer } from '../../../test/msw-server.js';
import { accountCheckSucceeds, loginSucceeds } from '../../../test/admin-app-harness.js';
import {
  answerWithAttendancePage,
  getCellUnderHeader,
  getEmployeeSelect,
  getRowForDate,
  openAttendancePage,
  recordAttendanceRequests,
} from '../../../test/attendance-monitoring-test-helpers.js';
import {
  ATTENDANCE_MONITORING_URL,
  CLOCK_IN_ONLY_ROW,
  NO_CHECK_IN_DAY_OFF_ROW,
  NO_CHECK_IN_ROW,
  ON_TIME_ROW,
  UNKNOWN_EMPLOYEE_ROW,
  buildAttendanceMonitoringPage,
} from '../../../test/attendance-monitoring-fixtures.js';
import {
  BUDI,
  DEWI,
  RINA,
  buildEmployeeListPage,
  employeeListSucceeds,
} from '../../../test/employee-list-fixtures.js';
import {
  ATTENDANCE_LOAD_ERROR_MESSAGE,
  INVALID_RANGE_TABLE_MESSAGE,
} from '../utils/attendance-monitoring-messages.js';
import { RANGE_ORDER_MESSAGE } from '../utils/attendance-range.js';

// 20:00 UTC on 14 November is 03:00 WIB on 15 November: the WIB date is ahead of the UTC date.
const NOW_IN_WIB_TODAY_15_NOVEMBER = new Date('2026-11-14T20:00:00.000Z');
const UNLISTED_EMPLOYEE_ID = '0d9e8f7a-6b5c-4d3e-8f2a-1b0c9d8e7f6a';
const ROWS_PAGE = buildAttendanceMonitoringPage({
  items: [ON_TIME_ROW, CLOCK_IN_ONLY_ROW, UNKNOWN_EMPLOYEE_ROW],
  totalItems: 3,
});

function queryAsObject(query: URLSearchParams): Record<string, string> {
  return Object.fromEntries(query.entries());
}

function lastQuery(requestQueries: ReadonlyArray<URLSearchParams>): URLSearchParams {
  const query = requestQueries.at(-1);
  if (query === undefined) throw new Error('No attendance request was made.');
  return query;
}

function setDateField(label: 'From' | 'To', value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW_IN_WIB_TODAY_15_NOVEMBER);
  mswServer.use(
    loginSucceeds(),
    accountCheckSucceeds(),
    employeeListSucceeds(buildEmployeeListPage({ items: [RINA, BUDI, DEWI], totalItems: 3 })),
    http.get(ATTENDANCE_MONITORING_URL, () => HttpResponse.json(ROWS_PAGE)),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe('attendance request and URL', () => {
  it('should request the first of the WIB month through today when the URL has no range', async () => {
    const requestQueries = recordAttendanceRequests(() => HttpResponse.json(ROWS_PAGE));
    await openAttendancePage('/attendance');

    await screen.findByRole('row', { name: /2026-11-13/ });
    expect(queryAsObject(lastQuery(requestQueries))).toEqual({
      from: '2026-11-01',
      to: '2026-11-15',
      page: '1',
      pageSize: '20',
    });
  });

  it('should send a preset range from page 1 and write it to the URL when the HR user searches from page 3', async () => {
    const requestQueries = recordAttendanceRequests(() => HttpResponse.json(ROWS_PAGE));
    const { user, router } = await openAttendancePage('/attendance?page=3');
    await screen.findByRole('row', { name: /2026-11-13/ });

    await user.click(screen.getByRole('button', { name: '1 week' }));
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => expect(lastQuery(requestQueries).get('from')).toBe('2026-11-09'));
    expect(queryAsObject(lastQuery(requestQueries))).toEqual({
      from: '2026-11-09',
      to: '2026-11-15',
      page: '1',
      pageSize: '20',
    });
    expect(router.state.location.search).toEqual({
      from: '2026-11-09',
      to: '2026-11-15',
      page: 1,
    });
  });

  it('should send the chosen employee and write it to the URL with page 1 when the HR user picks an employee', async () => {
    const requestQueries = recordAttendanceRequests(() => HttpResponse.json(ROWS_PAGE));
    const { user, router } = await openAttendancePage('/attendance?page=2');
    await screen.findByRole('row', { name: /2026-11-13/ });
    await waitFor(() => expect(getEmployeeSelect()).toBeEnabled());

    await user.selectOptions(getEmployeeSelect(), BUDI.name);

    await waitFor(() => expect(lastQuery(requestQueries).get('employeeId')).toBe(BUDI.accountId));
    expect(lastQuery(requestQueries).get('page')).toBe('1');
    expect(router.state.location.search).toEqual(
      expect.objectContaining({ employeeId: BUDI.accountId, page: 1 }),
    );
  });

  it('should request the next page and write it to the URL when the HR user presses Next page', async () => {
    const requestQueries = recordAttendanceRequests((query) =>
      answerWithAttendancePage({
        items: [ON_TIME_ROW],
        page: Number(query.get('page') ?? 1),
        totalItems: 60,
      }),
    );
    const { user, router } = await openAttendancePage('/attendance');
    await screen.findByRole('row', { name: /2026-11-13/ });

    await user.click(screen.getByRole('button', { name: 'Next page' }));

    await waitFor(() => expect(lastQuery(requestQueries).get('page')).toBe('2'));
    expect(router.state.location.search).toEqual(expect.objectContaining({ page: 2 }));
  });

  it('should show the range message and send no request when From is after To', async () => {
    const requestQueries = recordAttendanceRequests(() => HttpResponse.json(ROWS_PAGE));
    const { user, router } = await openAttendancePage('/attendance');
    await screen.findByRole('row', { name: /2026-11-13/ });

    setDateField('From', '2026-11-20');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByText(RANGE_ORDER_MESSAGE)).toBeInTheDocument();
    expect(requestQueries).toHaveLength(1);
    expect(router.state.location.pathname).toBe('/attendance');
  });

  it('should send no attendance request when the URL holds an out-of-order range', async () => {
    const requestQueries = recordAttendanceRequests(() => HttpResponse.json(ROWS_PAGE));
    await openAttendancePage('/attendance?from=2026-11-10&to=2026-11-01');

    expect(await screen.findByText(RANGE_ORDER_MESSAGE)).toBeInTheDocument();
    expect(await screen.findByText(INVALID_RANGE_TABLE_MESSAGE)).toBeInTheDocument();
    await screen.findByRole('option', { name: RINA.name });
    expect(requestQueries).toHaveLength(0);
  });
});

describe('attendance rows', () => {
  it('should show the employee name, WIB times, and labelled statuses for each day', async () => {
    await openAttendancePage('/attendance');

    const onTimeRow = await screen.findByRole('row', { name: /2026-11-13/ });
    expect(getCellUnderHeader(onTimeRow, 'Employee')).toHaveTextContent('Rina Kusuma');
    expect(getCellUnderHeader(onTimeRow, 'Clock in')).toHaveTextContent('2026-11-13 08:02');
    expect(getCellUnderHeader(onTimeRow, 'Clock out')).toHaveTextContent('2026-11-13 18:30');
    expect(within(onTimeRow).getByText('On-time clock-in')).toHaveClass(
      'dexa-status-label--success',
    );
    expect(within(onTimeRow).getByText('Late clock-out')).toHaveClass('dexa-status-label--neutral');

    const lateRow = getRowForDate('2026-11-14');
    expect(within(lateRow).getByText('Late clock-in')).toHaveClass('dexa-status-label--warning');
  });

  it('should show Not available for an unknown employee and a warning for an early clock out', async () => {
    await openAttendancePage('/attendance');

    const unknownRow = await screen.findByRole('row', { name: /2026-11-12/ });
    expect(getCellUnderHeader(unknownRow, 'Employee')).toHaveTextContent('Not available');
    expect(within(unknownRow).getByText('Early clock-out')).toHaveClass(
      'dexa-status-label--warning',
    );
  });

  it('should leave the Clock out cell empty and show Not recorded yet when the day has no clock out', async () => {
    await openAttendancePage('/attendance');

    const clockInOnlyRow = await screen.findByRole('row', { name: /2026-11-14/ });
    expect(getCellUnderHeader(clockInOnlyRow, 'Clock out').textContent).toBe('');
    expect(within(clockInOnlyRow).getByText('Not recorded yet')).toBeInTheDocument();
  });

  it('should leave the Clock in cell empty and show the stored statuses for a request-created day with no check-in', async () => {
    mswServer.use(
      http.get(ATTENDANCE_MONITORING_URL, () =>
        answerWithAttendancePage({
          items: [NO_CHECK_IN_ROW, NO_CHECK_IN_DAY_OFF_ROW],
          totalItems: 2,
        }),
      ),
    );
    await openAttendancePage('/attendance');

    const workingDayRow = await screen.findByRole('row', { name: /2026-11-10/ });
    expect(getCellUnderHeader(workingDayRow, 'Clock in').textContent).toBe('');
    expect(getCellUnderHeader(workingDayRow, 'Clock-in status')).toHaveTextContent(
      'Not recorded yet',
    );
    const dayOffRow = getRowForDate('2026-11-08');
    expect(getCellUnderHeader(dayOffRow, 'Clock in').textContent).toBe('');
    expect(getCellUnderHeader(dayOffRow, 'Clock-in status')).toHaveTextContent('Not required');
  });

  it('should render no buttons, links, or form fields in any attendance row', async () => {
    await openAttendancePage('/attendance');
    await screen.findByRole('row', { name: /2026-11-13/ });

    for (const businessDate of ['2026-11-12', '2026-11-13', '2026-11-14']) {
      const row = getRowForDate(businessDate);
      expect(within(row).queryAllByRole('button')).toHaveLength(0);
      expect(within(row).queryAllByRole('link')).toHaveLength(0);
      expect(within(row).queryAllByRole('textbox')).toHaveLength(0);
      expect(within(row).queryAllByRole('combobox')).toHaveLength(0);
    }
  });
});

describe('attendance states and filters', () => {
  it('should name the range in the empty message when no attendance matches', async () => {
    recordAttendanceRequests(() => answerWithAttendancePage({ totalItems: 0 }));
    await openAttendancePage('/attendance');

    expect(
      await screen.findByText('No attendance was recorded from 2026-11-01 to 2026-11-15.'),
    ).toBeInTheDocument();
  });

  it('should name the employee in the empty message when the list is filtered by employee', async () => {
    recordAttendanceRequests(() => answerWithAttendancePage({ totalItems: 0 }));
    await openAttendancePage(`/attendance?employeeId=${BUDI.accountId}`);

    expect(
      await screen.findByText(
        'No attendance was recorded for this employee from 2026-11-01 to 2026-11-15.',
      ),
    ).toBeInTheDocument();
  });

  it('should show the load error and reload the list when the HR user presses Try again', async () => {
    const requestQueries = recordAttendanceRequests((_query, requestIndex) =>
      requestIndex === 0
        ? HttpResponse.json(
            { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Something went wrong.' },
            { status: 500 },
          )
        : answerWithAttendancePage({ items: [ON_TIME_ROW], totalItems: 1 }),
    );
    const { user } = await openAttendancePage('/attendance');

    expect(await screen.findByText(ATTENDANCE_LOAD_ERROR_MESSAGE)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await screen.findByRole('row', { name: /2026-11-13/ });
    expect(requestQueries).toHaveLength(2);
  });

  it('should say that only the first 100 employees are listed when the company has more', async () => {
    mswServer.use(
      employeeListSucceeds(
        buildEmployeeListPage({ items: [RINA, BUDI, DEWI], totalItems: 150, pageSize: 100 }),
      ),
    );
    await openAttendancePage('/attendance');

    expect(await screen.findByText('Only the first 100 employees are listed.')).toBeInTheDocument();
  });

  it('should keep the employee named in the URL selected when that employee is not on the listed page', async () => {
    await openAttendancePage(`/attendance?employeeId=${UNLISTED_EMPLOYEE_ID}`);

    await waitFor(() => expect(getEmployeeSelect()).toBeEnabled());
    expect(getEmployeeSelect()).toHaveDisplayValue('Selected employee');
  });
});
