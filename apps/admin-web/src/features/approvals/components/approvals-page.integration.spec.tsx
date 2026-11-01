import { screen, waitFor } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mswServer } from '../../../test/msw-server.js';
import { accountCheckSucceeds, loginSucceeds } from '../../../test/admin-app-harness.js';
import {
  CORRECTION_REQUESTS_URL,
  OVERTIME_REQUESTS_URL,
  PENDING_CORRECTION,
  PENDING_OVERTIME,
  buildCorrectionReviewPage,
  buildOvertimeReviewPage,
  correctionQueueSucceeds,
  overtimeDetailSucceeds,
  overtimeQueueSucceeds,
} from '../../../test/approvals-fixtures.js';
import {
  openApprovalsPage,
  recordApprovalQueueRequests,
} from '../../../test/approvals-test-helpers.js';
import { getCellUnderHeader } from '../../../test/data-table-test-helpers.js';
import {
  BUDI,
  DEWI,
  buildEmployeeListPage,
  employeeListSucceeds,
} from '../../../test/employee-list-fixtures.js';

// 20:00 UTC on 14 November is 03:00 WIB on 15 November: the WIB date is ahead of the UTC date. The default range
// (PRD APR-1) is therefore the first of the WIB month through 2026-11-15.
const NOW_IN_WIB_TODAY_15_NOVEMBER = new Date('2026-11-14T20:00:00.000Z');
const DEFAULT_QUERY = {
  from: '2026-11-01',
  to: '2026-11-15',
  page: '1',
  pageSize: '20',
  status: 'PENDING',
};

function queryAsObject(query: URLSearchParams): Record<string, string> {
  return Object.fromEntries(query.entries());
}

function lastQuery(queries: ReadonlyArray<URLSearchParams>): URLSearchParams {
  const query = queries.at(-1);
  if (query === undefined) throw new Error('No queue request was made.');
  return query;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW_IN_WIB_TODAY_15_NOVEMBER);
  mswServer.use(
    loginSucceeds(),
    accountCheckSucceeds(),
    employeeListSucceeds(buildEmployeeListPage({ items: [BUDI, DEWI], totalItems: 2 })),
    overtimeQueueSucceeds(buildOvertimeReviewPage({ items: [PENDING_OVERTIME], totalItems: 1 })),
    correctionQueueSucceeds(
      buildCorrectionReviewPage({ items: [PENDING_CORRECTION], totalItems: 1 }),
    ),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe('approvals queue filters and URL', () => {
  it('should request the WIB month through today with the Pending default on the Overtime tab', async () => {
    const overtimeQueries = recordApprovalQueueRequests(OVERTIME_REQUESTS_URL, () =>
      HttpResponse.json(buildOvertimeReviewPage({ items: [PENDING_OVERTIME], totalItems: 1 })),
    );
    const { router } = await openApprovalsPage('/approvals');

    await screen.findByText('The client visit ran past office hours.');
    expect(queryAsObject(lastQuery(overtimeQueries))).toEqual(DEFAULT_QUERY);
    expect(router.state.location.search).toEqual({});
  });

  it('should request the chosen status and write it to the URL with page 1', async () => {
    const overtimeQueries = recordApprovalQueueRequests(OVERTIME_REQUESTS_URL, () =>
      HttpResponse.json(
        buildOvertimeReviewPage({ items: [PENDING_OVERTIME], totalItems: 3, page: 1 }),
      ),
    );
    const { user, router } = await openApprovalsPage('/approvals');
    await screen.findByText('The client visit ran past office hours.');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'Approved');

    await waitFor(() => expect(lastQuery(overtimeQueries).get('status')).toBe('APPROVED'));
    expect(lastQuery(overtimeQueries).get('page')).toBe('1');
    expect(router.state.location.search).toEqual({ status: 'APPROVED', page: 1 });
  });

  it('should request the chosen employee from the loaded options and write the ID to the URL', async () => {
    const overtimeQueries = recordApprovalQueueRequests(OVERTIME_REQUESTS_URL, () =>
      HttpResponse.json(buildOvertimeReviewPage({ items: [PENDING_OVERTIME], totalItems: 1 })),
    );
    const { user, router } = await openApprovalsPage('/approvals');
    await screen.findByText('The client visit ran past office hours.');

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Employee' })).toBeEnabled());
    await user.selectOptions(screen.getByRole('combobox', { name: 'Employee' }), 'Dewi Lestari');

    await waitFor(() => expect(lastQuery(overtimeQueries).get('employeeId')).toBe(DEWI.accountId));
    expect(lastQuery(overtimeQueries).get('page')).toBe('1');
    expect(router.state.location.search).toEqual({ employeeId: DEWI.accountId, page: 1 });
  });

  it('should request the preset range from page 1 and write it to the URL when the HR user searches', async () => {
    const overtimeQueries = recordApprovalQueueRequests(OVERTIME_REQUESTS_URL, () =>
      HttpResponse.json(buildOvertimeReviewPage({ items: [PENDING_OVERTIME], totalItems: 1 })),
    );
    const { user, router } = await openApprovalsPage('/approvals');
    await screen.findByText('The client visit ran past office hours.');

    await user.click(screen.getByRole('button', { name: '1 week' }));
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => expect(lastQuery(overtimeQueries).get('from')).toBe('2026-11-09'));
    expect(queryAsObject(lastQuery(overtimeQueries))).toEqual({
      ...DEFAULT_QUERY,
      from: '2026-11-09',
    });
    expect(router.state.location.search).toEqual({
      from: '2026-11-09',
      to: '2026-11-15',
      page: 1,
    });
  });

  it('should open the URL with the tab, status, and page it names', async () => {
    const correctionQueries = recordApprovalQueueRequests(CORRECTION_REQUESTS_URL, () =>
      HttpResponse.json(buildCorrectionReviewPage({ items: [PENDING_CORRECTION], totalItems: 1 })),
    );
    await openApprovalsPage('/approvals?tab=corrections&status=APPROVED&page=2');

    await screen.findByText('I forgot to punch in that morning.');
    expect(queryAsObject(lastQuery(correctionQueries))).toEqual({
      ...DEFAULT_QUERY,
      status: 'APPROVED',
      page: '2',
    });
    expect(screen.getByRole('tab', { name: 'Corrections' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});

describe('approvals queue rows and links', () => {
  it('should show the requester, interval, approved overtime, and status only for the active tab', async () => {
    await openApprovalsPage('/approvals');

    const overtimeRow = await screen.findByRole('row', { name: /Rina Kusuma/ });
    expect(getCellUnderHeader(overtimeRow, 'Requested overtime')).toHaveTextContent('17:00–19:00');
    expect(getCellUnderHeader(overtimeRow, 'Approved overtime')).toHaveTextContent('0 min');
    expect(getCellUnderHeader(overtimeRow, 'Status')).toHaveTextContent('Awaiting approval');
    expect(
      screen.queryByRole('row', { name: /I forgot to punch in that morning/ }),
    ).not.toBeInTheDocument();
  });

  it('should show the current and requested day for a correction and keep the other queue unmounted', async () => {
    const overtimeQueries = recordApprovalQueueRequests(OVERTIME_REQUESTS_URL, () =>
      HttpResponse.json(buildOvertimeReviewPage({ items: [PENDING_OVERTIME], totalItems: 1 })),
    );
    const correctionQueries = recordApprovalQueueRequests(CORRECTION_REQUESTS_URL, () =>
      HttpResponse.json(buildCorrectionReviewPage({ items: [PENDING_CORRECTION], totalItems: 1 })),
    );
    const { user } = await openApprovalsPage('/approvals');
    await screen.findByText('The client visit ran past office hours.');

    await user.click(screen.getByRole('tab', { name: 'Corrections' }));

    const correctionRow = await screen.findByRole('row', { name: /Rina Kusuma/ });
    expect(getCellUnderHeader(correctionRow, 'Current')).toHaveTextContent('Pending · —');
    expect(getCellUnderHeader(correctionRow, 'Requested')).toHaveTextContent('Present · 08:00');
    expect(overtimeQueries).toHaveLength(1);
    expect(correctionQueries).toHaveLength(1);
  });

  it('should open the review detail when the HR user presses Review on a row', async () => {
    mswServer.use(overtimeDetailSucceeds(PENDING_OVERTIME));
    const { user } = await openApprovalsPage('/approvals');

    await user.click(
      await screen.findByRole('link', { name: 'Review overtime request of Rina Kusuma' }),
    );

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Rina Kusuma' }),
    ).toBeInTheDocument();
  });

  it('should include the business date and requester in the row without the employee position', async () => {
    await openApprovalsPage('/approvals');

    const overtimeRow = await screen.findByRole('row', { name: /2026-11-12/ });
    expect(getCellUnderHeader(overtimeRow, 'Date')).toHaveTextContent('2026-11-12');
    expect(getCellUnderHeader(overtimeRow, 'Reason')).toHaveTextContent(
      'The client visit ran past office hours.',
    );
  });
});
