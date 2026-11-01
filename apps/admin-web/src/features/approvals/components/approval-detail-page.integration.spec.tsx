import { screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import type { OvertimeRequestReviewItem } from '@dexa/contracts';
import { mswServer } from '../../../test/msw-server.js';
import { accountCheckSucceeds, loginSucceeds } from '../../../test/admin-app-harness.js';
import {
  OVERTIME_REQUESTS_URL,
  OWN_PENDING_OVERTIME,
  PENDING_CORRECTION,
  PENDING_OVERTIME,
  buildOvertimeReviewItem,
  correctionDetailSucceeds,
  overtimeDetailSucceeds,
  toOvertimeRequest,
} from '../../../test/approvals-fixtures.js';
import {
  openApprovalsPage,
  openNotificationsPage,
  recordDecisions,
} from '../../../test/approvals-test-helpers.js';
import { getCellUnderHeader } from '../../../test/data-table-test-helpers.js';
import {
  REQUEST_NOTIFICATION,
  buildNotificationPage,
  inboxRespondsWith,
} from '../../../test/notification-inbox-fixtures.js';
import {
  ATTENDANCE_DAY_CHANGED_MESSAGE,
  REVIEW_REASON_REQUIRED_MESSAGE,
  SELF_REVIEW_FORBIDDEN_MESSAGE,
} from '../utils/approval-decision-messages.js';

const APPROVE_URL = `${OVERTIME_REQUESTS_URL}/:id/approve`;
const REJECT_URL = `${OVERTIME_REQUESTS_URL}/:id/reject`;
const REVIEW_NOTE = 'Matches the manager approval.';
const REJECTION_NOTE = 'No approval from the team lead.';

beforeEach(() => {
  mswServer.use(loginSucceeds(), accountCheckSucceeds());
});

function getItemByTitle(title: string): HTMLElement {
  const item = screen.getByText(title).closest('li');
  if (item === null) throw new Error(`No list entry holds "${title}".`);
  return item;
}

/** The detail item the screen must refetch into after a recorded decision (status and review reason visible). */
function decidedOvertime(overrides: Partial<OvertimeRequestReviewItem>): OvertimeRequestReviewItem {
  return buildOvertimeReviewItem({ id: PENDING_OVERTIME.id, ...overrides });
}

/** Answers the overtime detail with the pending item first, and with `decidedItem` on every later load. */
function overtimeDetailRespondsPendingThen(decidedItem: OvertimeRequestReviewItem) {
  let callCount = 0;
  mswServer.use(
    http.get(`${OVERTIME_REQUESTS_URL}/:id`, () => {
      callCount += 1;
      return HttpResponse.json(callCount === 1 ? PENDING_OVERTIME : decidedItem);
    }),
  );
  return { getCallCount: () => callCount };
}

describe('approval detail values', () => {
  it('should show the requester, the compared values, and the reason for an overtime request', async () => {
    mswServer.use(overtimeDetailSucceeds(PENDING_OVERTIME));
    await openApprovalsPage(`/approvals/overtime/${PENDING_OVERTIME.id}`);

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Rina Kusuma' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Overtime request')).toBeInTheDocument();
    const comparison = screen.getByRole('table', { name: /Current approved overtime/ });
    const intervalRow = within(comparison).getByRole('row', { name: /^Overtime/ });
    expect(getCellUnderHeader(intervalRow, 'Current')).toHaveTextContent('0 min approved');
    expect(getCellUnderHeader(intervalRow, 'Requested')).toHaveTextContent('17:00–19:00');
    expect(screen.getByText('The client visit ran past office hours.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled();
  });

  it('should show the current and requested day for a correction request', async () => {
    mswServer.use(correctionDetailSucceeds(PENDING_CORRECTION));
    await openApprovalsPage(`/approvals/correction/${PENDING_CORRECTION.id}`);

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Rina Kusuma' }),
    ).toBeInTheDocument();
    const comparison = screen.getByRole('table', { name: /Current day/ });
    const dayRow = within(comparison).getByRole('row', { name: /^Day status/ });
    expect(getCellUnderHeader(dayRow, 'Current')).toHaveTextContent('Pending');
    expect(getCellUnderHeader(dayRow, 'Requested')).toHaveTextContent('Present');
    expect(
      getCellUnderHeader(within(comparison).getByRole('row', { name: /^Clock in/ }), 'Requested'),
    ).toHaveTextContent('08:00');
  });

  it('should say the link is not valid when the path names no valid request ID', async () => {
    await openApprovalsPage('/approvals/overtime/not-a-uuid');

    expect(await screen.findByText('This approval link is not valid.')).toBeInTheDocument();
  });
});

describe('approve', () => {
  it('should send the optional note, refetch the detail, and show the recorded approval', async () => {
    const approved = decidedOvertime({
      status: 'APPROVED',
      reviewReason: REVIEW_NOTE,
      reviewedAt: '2026-11-14T01:00:00.000Z',
    });
    const detail = overtimeDetailRespondsPendingThen(approved);
    const approveBodies = recordDecisions(APPROVE_URL, () =>
      HttpResponse.json(toOvertimeRequest(approved)),
    );
    const { user } = await openApprovalsPage(`/approvals/overtime/${PENDING_OVERTIME.id}`);

    await user.click(await screen.findByRole('button', { name: 'Approve' }));
    const decisionDialog = await screen.findByRole('dialog', { name: 'Approve this request?' });
    await user.type(within(decisionDialog).getByLabelText('Review note'), REVIEW_NOTE);
    await user.click(within(decisionDialog).getByRole('button', { name: 'Approve request' }));

    expect(approveBodies).toEqual([{ reviewReason: REVIEW_NOTE }]);
    expect(await screen.findByText('Request approved')).toBeInTheDocument();
    expect(await screen.findByText('Approved')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.getByText('This request is decided and cannot be changed.')).toBeInTheDocument();
    await waitFor(() => expect(detail.getCallCount()).toBe(2));
  });

  it('should send an empty note when the reviewer approves without typing one', async () => {
    const approved = decidedOvertime({
      status: 'APPROVED',
      reviewedAt: '2026-11-14T01:00:00.000Z',
    });
    const detail = overtimeDetailRespondsPendingThen(approved);
    const approveBodies = recordDecisions(APPROVE_URL, () =>
      HttpResponse.json(toOvertimeRequest(approved)),
    );
    const { user } = await openApprovalsPage(`/approvals/overtime/${PENDING_OVERTIME.id}`);

    await user.click(await screen.findByRole('button', { name: 'Approve' }));
    const decisionDialog = await screen.findByRole('dialog', { name: 'Approve this request?' });
    await user.click(within(decisionDialog).getByRole('button', { name: 'Approve request' }));

    expect(approveBodies).toEqual([{}]);
    expect(await screen.findByText('Request approved')).toBeInTheDocument();
    await waitFor(() => expect(detail.getCallCount()).toBe(2));
  });
});

describe('reject', () => {
  it('should refuse an empty note without posting, keeping the dialog open', async () => {
    mswServer.use(overtimeDetailSucceeds(PENDING_OVERTIME));
    const rejectBodies = recordDecisions(REJECT_URL, () =>
      HttpResponse.json(toOvertimeRequest(decidedOvertime({ status: 'REJECTED' }))),
    );
    const { user } = await openApprovalsPage(`/approvals/overtime/${PENDING_OVERTIME.id}`);

    await user.click(await screen.findByRole('button', { name: 'Reject' }));
    const decisionDialog = await screen.findByRole('dialog', { name: 'Reject this request?' });
    await user.click(within(decisionDialog).getByRole('button', { name: 'Reject request' }));

    expect(
      await within(decisionDialog).findByText(REVIEW_REASON_REQUIRED_MESSAGE),
    ).toBeInTheDocument();
    expect(rejectBodies).toEqual([]);
  });

  it('should send the note, refetch the detail, and show the recorded rejection', async () => {
    const rejected = decidedOvertime({
      status: 'REJECTED',
      reviewReason: REJECTION_NOTE,
      reviewedAt: '2026-11-14T01:30:00.000Z',
    });
    const detail = overtimeDetailRespondsPendingThen(rejected);
    const rejectBodies = recordDecisions(REJECT_URL, () =>
      HttpResponse.json(toOvertimeRequest(rejected)),
    );
    const { user } = await openApprovalsPage(`/approvals/overtime/${PENDING_OVERTIME.id}`);

    await user.click(await screen.findByRole('button', { name: 'Reject' }));
    const decisionDialog = await screen.findByRole('dialog', { name: 'Reject this request?' });
    await user.type(within(decisionDialog).getByLabelText('Review note'), REJECTION_NOTE);
    await user.click(within(decisionDialog).getByRole('button', { name: 'Reject request' }));

    expect(rejectBodies).toEqual([{ reviewReason: REJECTION_NOTE }]);
    expect(await screen.findByText('Request rejected')).toBeInTheDocument();
    expect(await screen.findByText('Rejected')).toBeInTheDocument();
    expect(screen.getByText(REJECTION_NOTE)).toBeInTheDocument();
    await waitFor(() => expect(detail.getCallCount()).toBe(2));
  });
});

describe('review rules', () => {
  it("should hide Approve and Reject and explain why on the reviewer's own request", async () => {
    mswServer.use(overtimeDetailSucceeds(OWN_PENDING_OVERTIME));
    await openApprovalsPage(`/approvals/overtime/${OWN_PENDING_OVERTIME.id}`);

    expect(await screen.findByText(SELF_REVIEW_FORBIDDEN_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
  });

  it('should show the conflict message and refetch the detail when the day changed', async () => {
    const detail = overtimeDetailRespondsPendingThen(PENDING_OVERTIME);
    const approveBodies = recordDecisions(APPROVE_URL, () =>
      HttpResponse.json(
        { statusCode: 409, code: 'ATTENDANCE_DAY_CHANGED', message: 'The day changed.' },
        { status: 409 },
      ),
    );
    const { user } = await openApprovalsPage(`/approvals/overtime/${PENDING_OVERTIME.id}`);

    await user.click(await screen.findByRole('button', { name: 'Approve' }));
    const decisionDialog = await screen.findByRole('dialog', { name: 'Approve this request?' });
    await user.click(within(decisionDialog).getByRole('button', { name: 'Approve request' }));

    expect(
      await within(decisionDialog).findByText(ATTENDANCE_DAY_CHANGED_MESSAGE),
    ).toBeInTheDocument();
    await waitFor(() => expect(detail.getCallCount()).toBe(2));
    expect(approveBodies).toHaveLength(1);
  });
});

describe('link from a notification', () => {
  it('should open the approval detail of the request the notification names', async () => {
    mswServer.use(
      inboxRespondsWith(buildNotificationPage({ items: [REQUEST_NOTIFICATION] })),
      overtimeDetailSucceeds(PENDING_OVERTIME),
    );
    const { user } = await openNotificationsPage('/notifications');

    await user.click(
      within(getItemByTitle(REQUEST_NOTIFICATION.title)).getByRole('link', {
        name: 'Open request',
      }),
    );

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Rina Kusuma' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Overtime request')).toBeInTheDocument();
  });
});
