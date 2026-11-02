import type { RequestStatus } from '@dexa/contracts';
import type { StatusLabelProps } from '@dexa/ui';

type RequestStatusDisplay = {
  text: string;
  tone: NonNullable<StatusLabelProps['tone']>;
};

// Awaiting approval is a warning, and a rejection is an error. The text carries the meaning;
// the tone only adds colour. The status filter reuses these words, so the filter and the rows always agree.
const REQUEST_STATUS_DISPLAY: Readonly<Record<RequestStatus, RequestStatusDisplay>> = {
  PENDING: { text: 'Awaiting approval', tone: 'warning' },
  APPROVED: { text: 'Approved', tone: 'success' },
  REJECTED: { text: 'Rejected', tone: 'error' },
};

export function getRequestStatusDisplay(status: RequestStatus): RequestStatusDisplay {
  return REQUEST_STATUS_DISPLAY[status];
}
