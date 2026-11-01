import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CorrectionRequest, OvertimeRequest } from '@dexa/contracts';
import { mswServer } from '../../../test/msw-server.js';
import {
  EMPLOYEE_ACCOUNT,
  accountCheckSucceeds,
  loginSucceeds,
  renderEmployeeApp,
  signInWith,
} from '../../../test/employee-app-harness.js';
import {
  getRequestsEmptyMessage,
  REQUESTS_LOAD_ERROR_MESSAGE,
} from '../utils/requests-messages.js';

const OVERTIME_URL = '/api/v1/overtime-requests/me';
const CORRECTION_URL = '/api/v1/attendance-corrections/me';

const OVERTIME_PENDING: OvertimeRequest = {
  id: '3c1f7e2a-9d4b-4a6e-8f0c-5b2d1e9a7c01',
  businessDate: '2026-10-29',
  // 18:30–21:00 WIB
  startAt: '2026-10-29T11:30:00.000Z',
  endAt: '2026-10-29T14:00:00.000Z',
  reason: 'Month-end reporting deadline',
  status: 'PENDING',
  reviewReason: null,
  reviewedAt: null,
  createdAt: '2026-10-28T10:00:00.000Z',
};
// The window ends at 00:30 WIB, on the day after the business date.
const OVERTIME_REJECTED_NEXT_DAY: OvertimeRequest = {
  id: '3c1f7e2a-9d4b-4a6e-8f0c-5b2d1e9a7c02',
  businessDate: '2026-10-30',
  startAt: '2026-10-30T13:00:00.000Z',
  endAt: '2026-10-30T17:30:00.000Z',
  reason: 'Late data migration',
  status: 'REJECTED',
  reviewReason: 'Overlaps approved overtime',
  reviewedAt: '2026-10-30T12:00:00.000Z',
  createdAt: '2026-10-29T10:00:00.000Z',
};
const CORRECTION_PRESENT_REJECTED: CorrectionRequest = {
  id: '7d2e9c1b-4f3a-4b8e-9a0d-6c5e4f3b2a01',
  businessDate: '2026-10-27',
  requestedDayStatus: 'PRESENT',
  // 09:00 and 18:02 WIB
  clockInAt: '2026-10-27T02:00:00.000Z',
  clockOutAt: '2026-10-27T11:02:00.000Z',
  reason: 'Forgot to clock in after a VPN outage',
  status: 'REJECTED',
  reviewReason: 'Attach the VPN log first',
  reviewedAt: '2026-10-27T12:00:00.000Z',
  createdAt: '2026-10-27T13:00:00.000Z',
};
const CORRECTION_LEAVE_PENDING: CorrectionRequest = {
  id: '7d2e9c1b-4f3a-4b8e-9a0d-6c5e4f3b2a02',
  businessDate: '2026-10-20',
  requestedDayStatus: 'LEAVE',
  clockInAt: null,
  clockOutAt: null,
  reason: 'Leave was planned but not recorded',
  status: 'PENDING',
  reviewReason: null,
  reviewedAt: null,
  createdAt: '2026-10-21T08:00:00.000Z',
};

function requestPage<TItem>(
  items: ReadonlyArray<TItem>,
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

/** Answers every request to one list and keeps each query, so a test can assert what was asked for. */
function listEndpoint(
  url: string,
  respond: (query: URLSearchParams) => Response = () =>
    HttpResponse.json(requestPage([OVERTIME_PENDING, OVERTIME_REJECTED_NEXT_DAY])),
) {
  const requestedQueries: URLSearchParams[] = [];
  return {
    requestedQueries,
    handler: http.get(url, ({ request }) => {
      const query = new URL(request.url).searchParams;
      requestedQueries.push(query);
      return respond(query);
    }),
  };
}

function requestAt(
  requestedQueries: ReadonlyArray<URLSearchParams>,
  index: number,
): URLSearchParams {
  const query = requestedQueries[index];
  if (query === undefined) throw new Error(`No request at index ${index}.`);
  return query;
}

function queryAsObject(query: URLSearchParams): Record<string, string> {
  return Object.fromEntries(query.entries());
}

/** Signs in and opens Requests at the given path, through the login redirect the app uses for protected pages. */
async function openRequestsAt(path: string) {
  const user = userEvent.setup();
  const router = await renderEmployeeApp(`/login?redirect=${encodeURIComponent(path)}`);
  await signInWith(user, EMPLOYEE_ACCOUNT.email);
  await screen.findByRole('heading', { level: 1, name: 'Requests' });
  return { user, router };
}

/** The text of each cell in the row whose date cell has the given text. */
function rowTexts(dateText: string): string[] {
  const row = screen.getByRole('cell', { name: dateText }).closest('tr');
  if (row === null) throw new Error(`No row for ${dateText}.`);
  return within(row)
    .getAllByRole('cell')
    .map((cell) => cell.textContent ?? '');
}

beforeEach(() => {
  mswServer.use(loginSucceeds(), accountCheckSucceeds());
});

describe('requests tabs and URL state', () => {
  it('should request the overtime list on page 1 with no status, and not the corrections list, when the URL has no search', async () => {
    const overtime = listEndpoint(OVERTIME_URL);
    const corrections = listEndpoint(CORRECTION_URL);
    mswServer.use(overtime.handler, corrections.handler);

    const { router } = await openRequestsAt('/requests');

    await screen.findByRole('cell', { name: '2026-10-29' });
    expect(queryAsObject(requestAt(overtime.requestedQueries, 0))).toEqual({
      page: '1',
      pageSize: '20',
    });
    expect(corrections.requestedQueries).toHaveLength(0);
    expect(screen.getByRole('tab', { name: 'Overtime' })).toHaveAttribute('aria-selected', 'true');
    expect(router.state.location.search).toEqual({});
  });

  it('should show the corrections list and update the URL when the Corrections tab is pressed', async () => {
    const overtime = listEndpoint(OVERTIME_URL);
    const corrections = listEndpoint(CORRECTION_URL, () =>
      HttpResponse.json(requestPage([CORRECTION_LEAVE_PENDING])),
    );
    mswServer.use(overtime.handler, corrections.handler);
    const { user, router } = await openRequestsAt('/requests');
    await screen.findByRole('cell', { name: '2026-10-29' });

    await user.click(screen.getByRole('tab', { name: 'Corrections' }));

    expect(await screen.findByRole('cell', { name: '2026-10-20' })).toBeInTheDocument();
    expect(corrections.requestedQueries).toHaveLength(1);
    expect(queryAsObject(requestAt(corrections.requestedQueries, 0))).toEqual({
      page: '1',
      pageSize: '20',
    });
    expect(router.state.location.search).toEqual({ tab: 'corrections' });
    expect(screen.getByRole('tab', { name: 'Corrections' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('should open the corrections tab and request its list when the URL names it', async () => {
    const overtime = listEndpoint(OVERTIME_URL);
    const corrections = listEndpoint(CORRECTION_URL, () =>
      HttpResponse.json(requestPage([CORRECTION_PRESENT_REJECTED])),
    );
    mswServer.use(overtime.handler, corrections.handler);

    await openRequestsAt('/requests?tab=corrections');

    await screen.findByRole('cell', { name: '2026-10-27' });
    expect(overtime.requestedQueries).toHaveLength(0);
    expect(queryAsObject(requestAt(corrections.requestedQueries, 0))).toEqual({
      page: '1',
      pageSize: '20',
    });
  });

  it('should send the chosen status and start on page 1 when a status is selected', async () => {
    const overtime = listEndpoint(OVERTIME_URL);
    mswServer.use(overtime.handler);
    const { user, router } = await openRequestsAt('/requests?page=3');
    await screen.findByRole('cell', { name: '2026-10-29' });

    await user.selectOptions(screen.getByLabelText('Status'), 'APPROVED');

    await vi.waitFor(() => {
      expect(overtime.requestedQueries).toHaveLength(2);
    });
    expect(queryAsObject(requestAt(overtime.requestedQueries, 1))).toEqual({
      status: 'APPROVED',
      page: '1',
      pageSize: '20',
    });
    expect(router.state.location.search).toEqual({ status: 'APPROVED' });
  });

  it('should omit the status from the request again when All is selected', async () => {
    const overtime = listEndpoint(OVERTIME_URL);
    mswServer.use(overtime.handler);
    const { user, router } = await openRequestsAt('/requests?status=REJECTED');
    await screen.findByRole('cell', { name: '2026-10-30' });

    await user.selectOptions(screen.getByLabelText('Status'), 'ALL');

    await vi.waitFor(() => {
      expect(overtime.requestedQueries).toHaveLength(2);
    });
    expect(Object.keys(queryAsObject(requestAt(overtime.requestedQueries, 1)))).not.toContain(
      'status',
    );
    expect(router.state.location.search).toEqual({});
  });

  it('should request the next page and update the URL when Next is pressed', async () => {
    const overtime = listEndpoint(OVERTIME_URL, () =>
      HttpResponse.json(requestPage([OVERTIME_PENDING], { totalItems: 21, totalPages: 2 })),
    );
    mswServer.use(overtime.handler);
    const { user, router } = await openRequestsAt('/requests');
    await screen.findByRole('cell', { name: '2026-10-29' });

    await user.click(screen.getByRole('button', { name: 'Next page' }));

    await vi.waitFor(() => {
      expect(overtime.requestedQueries).toHaveLength(2);
    });
    expect(requestAt(overtime.requestedQueries, 1).get('page')).toBe('2');
    expect(router.state.location.search).toEqual({ page: 2 });
  });

  it('should return to page 1 of the other type when the tab changes from a later page', async () => {
    const overtime = listEndpoint(OVERTIME_URL, () =>
      HttpResponse.json(requestPage([OVERTIME_PENDING], { totalItems: 21, totalPages: 2 })),
    );
    const corrections = listEndpoint(CORRECTION_URL, () =>
      HttpResponse.json(requestPage([CORRECTION_LEAVE_PENDING])),
    );
    mswServer.use(overtime.handler, corrections.handler);
    const { user, router } = await openRequestsAt('/requests?page=2');
    await screen.findByRole('cell', { name: '2026-10-29' });

    await user.click(screen.getByRole('tab', { name: 'Corrections' }));

    await screen.findByRole('cell', { name: '2026-10-20' });
    expect(requestAt(corrections.requestedQueries, 0).get('page')).toBe('1');
    expect(router.state.location.search).toEqual({ tab: 'corrections' });
  });

  it.each([
    { case: 'an unknown tab and an unknown status', path: '/requests?tab=leave&status=CANCELLED' },
    { case: 'a tab and status in the wrong case', path: '/requests?tab=OVERTIME&status=approved' },
  ])('should open Overtime with every status when the URL has $case', async ({ path }) => {
    const overtime = listEndpoint(OVERTIME_URL);
    const corrections = listEndpoint(CORRECTION_URL);
    mswServer.use(overtime.handler, corrections.handler);

    await openRequestsAt(path);

    await screen.findByRole('cell', { name: '2026-10-29' });
    expect(queryAsObject(requestAt(overtime.requestedQueries, 0))).toEqual({
      page: '1',
      pageSize: '20',
    });
    expect(corrections.requestedQueries).toHaveLength(0);
  });
});

describe('requests tables', () => {
  it('should expose the overtime list as a named table with the requested columns', async () => {
    mswServer.use(listEndpoint(OVERTIME_URL).handler);

    await openRequestsAt('/requests');

    const table = await screen.findByRole('table', { name: 'Overtime requests' });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((header) => header.textContent);
    expect(headers).toEqual(['Date', 'Time', 'Reason', 'Status', 'Reviewer reason']);
  });

  it('should show the date, the WIB time window, the reason, the status label and a dash for a pending request', async () => {
    mswServer.use(listEndpoint(OVERTIME_URL).handler);

    await openRequestsAt('/requests');

    await screen.findByRole('cell', { name: '2026-10-29' });
    expect(rowTexts('2026-10-29')).toEqual([
      '2026-10-29',
      '18:30–21:00',
      'Month-end reporting deadline',
      'Awaiting approval',
      '—',
    ]);
  });

  it('should show the next-day hint and the rejection reason for a rejected request that ends after midnight WIB', async () => {
    mswServer.use(listEndpoint(OVERTIME_URL).handler);

    await openRequestsAt('/requests');

    await screen.findByRole('cell', { name: '2026-10-30' });
    expect(rowTexts('2026-10-30')).toEqual([
      '2026-10-30',
      '20:00–00:30 +1 day',
      'Late data migration',
      'Rejected',
      'Overlaps approved overtime',
    ]);
  });

  it('should show the correction columns with the requested outcome, WIB clock times and dashes for missing times', async () => {
    mswServer.use(
      listEndpoint(CORRECTION_URL, () =>
        HttpResponse.json(requestPage([CORRECTION_PRESENT_REJECTED, CORRECTION_LEAVE_PENDING])),
      ).handler,
    );

    await openRequestsAt('/requests?tab=corrections');

    const table = await screen.findByRole('table', { name: 'Correction requests' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual([
      'Date',
      'Requested outcome',
      'Clock in',
      'Clock out',
      'Reason',
      'Status',
      'Reviewer reason',
    ]);
    expect(rowTexts('2026-10-27')).toEqual([
      '2026-10-27',
      'Present',
      '09:00',
      '18:02',
      'Forgot to clock in after a VPN outage',
      'Rejected',
      'Attach the VPN log first',
    ]);
    expect(rowTexts('2026-10-20')).toEqual([
      '2026-10-20',
      'Leave',
      '—',
      '—',
      'Leave was planned but not recorded',
      'Awaiting approval',
      '—',
    ]);
  });
});

describe('requests states', () => {
  it('should show the overtime empty message when no overtime request exists', async () => {
    mswServer.use(listEndpoint(OVERTIME_URL, () => HttpResponse.json(requestPage([]))).handler);

    await openRequestsAt('/requests');

    expect(
      await screen.findByText(getRequestsEmptyMessage('overtime', undefined)),
    ).toBeInTheDocument();
  });

  it('should show the correction empty message when no correction request exists', async () => {
    mswServer.use(listEndpoint(CORRECTION_URL, () => HttpResponse.json(requestPage([]))).handler);

    await openRequestsAt('/requests?tab=corrections');

    expect(await screen.findByText('You have no correction requests yet.')).toBeInTheDocument();
  });

  it('should name the filter in the empty message when the status filter matches nothing', async () => {
    mswServer.use(listEndpoint(OVERTIME_URL, () => HttpResponse.json(requestPage([]))).handler);

    await openRequestsAt('/requests?status=REJECTED');

    expect(
      await screen.findByText(
        'No overtime requests have the status Rejected. Choose All to see every status.',
      ),
    ).toBeInTheDocument();
  });

  it('should show a loading message until the first page arrives', async () => {
    let releaseResponse: () => void = () => undefined;
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    mswServer.use(
      http.get(OVERTIME_URL, async () => {
        await responseGate;
        return HttpResponse.json(requestPage([OVERTIME_PENDING]));
      }),
    );

    await openRequestsAt('/requests');

    expect(await screen.findByText('Loading records…')).toBeInTheDocument();
    await act(async () => {
      releaseResponse();
    });
    expect(await screen.findByRole('cell', { name: '2026-10-29' })).toBeInTheDocument();
  });

  it('should keep the previous page on screen while the next page loads', async () => {
    let releaseSecondPage: () => void = () => undefined;
    const secondPageGate = new Promise<void>((resolve) => {
      releaseSecondPage = resolve;
    });
    mswServer.use(
      http.get(OVERTIME_URL, async ({ request }) => {
        const page = new URL(request.url).searchParams.get('page');
        if (page !== '2') {
          return HttpResponse.json(
            requestPage([OVERTIME_PENDING], { totalItems: 21, totalPages: 2 }),
          );
        }
        await secondPageGate;
        return HttpResponse.json(
          requestPage([OVERTIME_REJECTED_NEXT_DAY], { totalItems: 21, totalPages: 2 }),
        );
      }),
    );
    const { user } = await openRequestsAt('/requests');
    await screen.findByRole('cell', { name: '2026-10-29' });

    await user.click(screen.getByRole('button', { name: 'Next page' }));

    expect(await screen.findByText('Updating records…')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '2026-10-29' })).toBeInTheDocument();
    await act(async () => {
      releaseSecondPage();
    });
    expect(await screen.findByRole('cell', { name: '2026-10-30' })).toBeInTheDocument();
  });

  it('should show the error with Try again and load the list on retry', async () => {
    let isFirstRequest = true;
    const overtime = listEndpoint(OVERTIME_URL, () => {
      const shouldFail = isFirstRequest;
      isFirstRequest = false;
      if (shouldFail) {
        return HttpResponse.json(
          { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Failed.' },
          { status: 500 },
        );
      }
      return HttpResponse.json(requestPage([OVERTIME_PENDING]));
    });
    mswServer.use(overtime.handler);
    const { user } = await openRequestsAt('/requests');

    expect(await screen.findByText(REQUESTS_LOAD_ERROR_MESSAGE)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('cell', { name: '2026-10-29' })).toBeInTheDocument();
    expect(overtime.requestedQueries).toHaveLength(2);
  });
});

describe('requests create actions', () => {
  it('should open the overtime request form path when Request overtime is pressed', async () => {
    mswServer.use(listEndpoint(OVERTIME_URL).handler);
    const { user, router } = await openRequestsAt('/requests');

    await user.click(screen.getByRole('link', { name: 'Request overtime' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Request overtime' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/requests/overtime/new');
  });

  it('should open the correction request form path when Request correction is pressed', async () => {
    mswServer.use(listEndpoint(OVERTIME_URL).handler);
    const { user, router } = await openRequestsAt('/requests');

    await user.click(screen.getByRole('link', { name: 'Request correction' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Request correction' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/requests/corrections/new');
  });
});

describe('requests tab keyboard', () => {
  it('should select Corrections and move focus to it when the right arrow is pressed on Overtime', async () => {
    mswServer.use(
      listEndpoint(OVERTIME_URL).handler,
      listEndpoint(CORRECTION_URL, () => HttpResponse.json(requestPage([CORRECTION_LEAVE_PENDING])))
        .handler,
    );
    const { user, router } = await openRequestsAt('/requests');
    const overtimeTab = screen.getByRole('tab', { name: 'Overtime' });
    overtimeTab.focus();

    await user.keyboard('{ArrowRight}');

    await screen.findByRole('cell', { name: '2026-10-20' });
    expect(screen.getByRole('tab', { name: 'Corrections' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Corrections' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(router.state.location.search).toEqual({ tab: 'corrections' });
  });

  it('should wrap back to Overtime when the right arrow is pressed on Corrections', async () => {
    mswServer.use(
      listEndpoint(OVERTIME_URL).handler,
      listEndpoint(CORRECTION_URL, () => HttpResponse.json(requestPage([CORRECTION_LEAVE_PENDING])))
        .handler,
    );
    const { user } = await openRequestsAt('/requests?tab=corrections');
    await screen.findByRole('cell', { name: '2026-10-20' });
    screen.getByRole('tab', { name: 'Corrections' }).focus();

    await user.keyboard('{ArrowRight}');

    await screen.findByRole('cell', { name: '2026-10-29' });
    expect(screen.getByRole('tab', { name: 'Overtime' })).toHaveFocus();
  });

  it('should give only the selected tab a place in the tab order', async () => {
    mswServer.use(listEndpoint(OVERTIME_URL).handler);

    await openRequestsAt('/requests');

    expect(screen.getByRole('tab', { name: 'Overtime' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Corrections' })).toHaveAttribute('tabindex', '-1');
  });
});

describe('requests status filter', () => {
  it('should label the status filter and list All with the three request statuses', async () => {
    mswServer.use(listEndpoint(OVERTIME_URL).handler);

    await openRequestsAt('/requests');

    const select = screen.getByLabelText('Status');
    expect(select).toBeInstanceOf(HTMLSelectElement);
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['All', 'Awaiting approval', 'Approved', 'Rejected']);
  });
});
