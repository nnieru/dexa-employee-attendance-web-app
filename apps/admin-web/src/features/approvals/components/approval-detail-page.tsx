import { useEffect, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import type {
  CorrectionRequestReviewItem,
  OvertimeRequestReviewItem,
  RequestStatus,
} from '@dexa/contracts';
import { Alert, Button, PageShell, StatusLabel, useToast } from '@dexa/ui';
import type { RequestDecision, RequestDecisionTarget } from '../api/decide-request.js';
import { useApprovalDetail } from '../hooks/use-approval-detail.js';
import { useDecideRequest } from '../hooks/use-decide-request.js';
import {
  DAY_STATUS_TEXT,
  EMPTY_VALUE_TEXT,
  REQUESTED_OUTCOME_TEXT,
  formatApprovalInterval,
  formatOptionalTime,
  getApprovalStatusDisplay,
  getRequesterName,
} from '../utils/approval-display.js';
import { formatApprovalDateTime } from '../utils/approval-time.js';
import {
  APPROVALS_DETAIL_INVALID_PATH_MESSAGE,
  APPROVALS_DETAIL_LOAD_ERROR_MESSAGE,
  APPROVALS_PAGE_TITLE,
  CURRENT_VALUES_HEADING,
  REQUESTED_VALUES_HEADING,
  REQUEST_TYPE_LABEL,
} from '../utils/approval-messages.js';
import {
  DECISION_APPROVED_TITLE,
  DECISION_REJECTED_TITLE,
  SELF_REVIEW_FORBIDDEN_MESSAGE,
  getDecisionErrorMessage,
  isAttendanceDayChanged,
} from '../utils/approval-decision-messages.js';
import { RequestDecisionDialog } from './request-decision-dialog.js';

type ApprovalDetailPageProps = {
  target: RequestDecisionTarget;
  requestId: string;
  /** False when the route parameters are not a valid approval link. */
  isValidPath: boolean;
};

type PendingDecision = {
  decision: RequestDecision;
  reviewReason: string;
};

/**
 * The review detail. Current and requested values sit side by side. Approve and Reject are disabled
 * on a decided request and on the reviewer's own request. A stale correction reloads the day before another attempt.
 */
export function ApprovalDetailPage({ target, requestId, isValidPath }: ApprovalDetailPageProps) {
  const detail = useApprovalDetail(
    target === 'correction' ? 'corrections' : 'overtime',
    requestId,
    isValidPath,
  );
  const decide = useDecideRequest();
  const { showToast } = useToast();
  const [pendingDecision, setPendingDecision] = useState<PendingDecision | undefined>(undefined);
  const data = detail.data;
  const refetchDetail = detail.refetch;

  useEffect(() => {
    if (!decide.isError) return;
    if (isAttendanceDayChanged(decide.error)) void refetchDetail();
  }, [decide.error, decide.isError, refetchDetail]);

  if (!isValidPath) {
    return (
      <ApprovalDetailShell>
        <Alert variant="error">{APPROVALS_DETAIL_INVALID_PATH_MESSAGE}</Alert>
      </ApprovalDetailShell>
    );
  }

  if (detail.isError) {
    return (
      <ApprovalDetailShell>
        <Alert
          variant="error"
          action={
            <Button variant="secondary" onClick={() => void detail.refetch()}>
              Try again
            </Button>
          }
        >
          {APPROVALS_DETAIL_LOAD_ERROR_MESSAGE}
        </Alert>
      </ApprovalDetailShell>
    );
  }

  if (data === undefined) {
    return (
      <ApprovalDetailShell>
        <p role="status">Loading the request…</p>
      </ApprovalDetailShell>
    );
  }

  const statusDisplay = getApprovalStatusDisplay(data.status);

  function openDecision(decision: RequestDecision) {
    decide.reset();
    setPendingDecision({ decision, reviewReason: '' });
  }

  function handleConfirm(reviewReason: string) {
    if (pendingDecision === undefined) return;
    const isApprove = pendingDecision.decision === 'approve';
    decide.mutate(
      {
        target,
        requestId,
        decision: pendingDecision.decision,
        reviewReason,
      },
      {
        onSuccess: () => {
          setPendingDecision(undefined);
          showToast({
            variant: 'success',
            title: isApprove ? DECISION_APPROVED_TITLE : DECISION_REJECTED_TITLE,
            message: isApprove
              ? 'The request is approved. The employee can see the decision.'
              : 'The request is rejected. The employee can see your reason.',
          });
        },
      },
    );
  }

  return (
    <ApprovalDetailShell>
      <div className="approval-detail">
        <div className="approval-detail__heading">
          <div>
            <p className="approval-detail__type">
              {REQUEST_TYPE_LABEL[target === 'overtime' ? 'overtime' : 'corrections']} request
            </p>
            <h2 className="approval-detail__requester">{getRequesterName(data.requester)}</h2>
          </div>
          <StatusLabel tone={statusDisplay.tone}>{statusDisplay.text}</StatusLabel>
        </div>
        <dl className="work-schedule-summary">
          <dt>Business date</dt>
          <dd>{data.businessDate}</dd>
          <dt>Submitted</dt>
          <dd>{formatApprovalDateTime(data.createdAt)}</dd>
          {data.reviewedAt !== null && (
            <>
              <dt>Decided</dt>
              <dd>{formatApprovalDateTime(data.reviewedAt)}</dd>
            </>
          )}
        </dl>
        {target === 'overtime' ? (
          <OvertimeComparison item={data as OvertimeRequestReviewItem} />
        ) : (
          <CorrectionComparison item={data as CorrectionRequestReviewItem} />
        )}
        <section aria-labelledby="approval-reason-heading">
          <h3 id="approval-reason-heading" className="approval-detail__section-heading">
            Reason
          </h3>
          <p className="approval-detail__reason">{data.reason}</p>
        </section>
        {data.reviewReason !== null && data.reviewReason.trim() !== '' && (
          <section aria-labelledby="approval-review-reason-heading">
            <h3 id="approval-review-reason-heading" className="approval-detail__section-heading">
              Review note
            </h3>
            <p className="approval-detail__review-reason">{data.reviewReason}</p>
          </section>
        )}
        <DecisionActions
          status={data.status}
          isOwnRequest={data.isOwnRequest}
          isPending={decide.isPending}
          onApprove={() => openDecision('approve')}
          onReject={() => openDecision('reject')}
        />
      </div>
      {pendingDecision !== undefined && (
        <RequestDecisionDialog
          decision={pendingDecision.decision}
          isPending={decide.isPending}
          errorMessage={decide.isError ? getDecisionErrorMessage(decide.error) : undefined}
          onClose={() => setPendingDecision(undefined)}
          onConfirm={handleConfirm}
        />
      )}
    </ApprovalDetailShell>
  );
}

function ApprovalDetailShell({ children }: { children: ReactNode }) {
  return (
    <PageShell
      as="div"
      title={APPROVALS_PAGE_TITLE}
      description="Review one request. Approve or reject it after checking the current values."
    >
      <p>
        <Link to="/approvals" className="dexa-button dexa-button--secondary">
          Back to approvals
        </Link>
      </p>
      {children}
    </PageShell>
  );
}

function OvertimeComparison({ item }: { item: OvertimeRequestReviewItem }) {
  return (
    <table className="approval-comparison">
      <caption>Current approved overtime and the requested interval</caption>
      <thead>
        <tr>
          <th scope="col">Field</th>
          <th scope="col">{CURRENT_VALUES_HEADING}</th>
          <th scope="col">{REQUESTED_VALUES_HEADING}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">Overtime</th>
          <td>{item.current.approvedMinutes} min approved</td>
          <td>{formatApprovalInterval(item.startAt, item.endAt)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function CorrectionComparison({ item }: { item: CorrectionRequestReviewItem }) {
  const requestedTimes =
    item.requestedDayStatus === 'PRESENT'
      ? `${formatOptionalTime(item.clockInAt)}–${formatOptionalTime(item.clockOutAt)}`
      : EMPTY_VALUE_TEXT;
  return (
    <table className="approval-comparison">
      <caption>Current day and the requested correction</caption>
      <thead>
        <tr>
          <th scope="col">Field</th>
          <th scope="col">{CURRENT_VALUES_HEADING}</th>
          <th scope="col">{REQUESTED_VALUES_HEADING}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">Day status</th>
          <td>{DAY_STATUS_TEXT[item.current.dayStatus]}</td>
          <td>{REQUESTED_OUTCOME_TEXT[item.requestedDayStatus]}</td>
        </tr>
        <tr>
          <th scope="row">Clock in</th>
          <td>{formatOptionalTime(item.current.clockInAt)}</td>
          <td>{formatOptionalTime(item.clockInAt)}</td>
        </tr>
        <tr>
          <th scope="row">Clock out</th>
          <td>{formatOptionalTime(item.current.clockOutAt)}</td>
          <td>{formatOptionalTime(item.clockOutAt)}</td>
        </tr>
        {item.requestedDayStatus !== 'PRESENT' && (
          <tr>
            <th scope="row">Times</th>
            <td>{EMPTY_VALUE_TEXT}</td>
            <td>{requestedTimes}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function DecisionActions({
  status,
  isOwnRequest,
  isPending,
  onApprove,
  onReject,
}: {
  status: RequestStatus;
  isOwnRequest: boolean;
  isPending: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  if (status !== 'PENDING') {
    return <p className="approval-detail__note">This request is decided and cannot be changed.</p>;
  }
  if (isOwnRequest) {
    return <p className="approval-detail__note">{SELF_REVIEW_FORBIDDEN_MESSAGE}</p>;
  }
  return (
    <div className="approval-detail__actions">
      <Button disabled={isPending} onClick={onApprove}>
        Approve
      </Button>
      <Button variant="secondary" disabled={isPending} onClick={onReject}>
        Reject
      </Button>
    </div>
  );
}
