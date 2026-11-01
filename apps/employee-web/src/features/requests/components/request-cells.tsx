import type { RequestStatus } from '@dexa/contracts';
import { StatusLabel } from '@dexa/ui';
import { getRequestStatusDisplay } from '../utils/get-request-status-display.js';
import { EMPTY_VALUE_TEXT } from '../utils/requests-messages.js';

export function RequestStatusCell({ status }: { status: RequestStatus }) {
  const display = getRequestStatusDisplay(status);
  return <StatusLabel tone={display.tone}>{display.text}</StatusLabel>;
}

type ReviewerReasonCellProps = {
  status: RequestStatus;
  reviewReason: string | null;
};

// A rejection's reason is the explanation the employee needs, so it is shown in bold error text. The status label beside
// it carries the meaning in words, so the emphasis is not colour alone (DESIGN §8).
export function ReviewerReasonCell({ status, reviewReason }: ReviewerReasonCellProps) {
  if (reviewReason === null || reviewReason.trim() === '') return EMPTY_VALUE_TEXT;
  const className =
    status === 'REJECTED'
      ? 'requests-reviewer-reason requests-reviewer-reason--rejected'
      : 'requests-reviewer-reason';
  return <span className={className}>{reviewReason}</span>;
}
