import type { CorrectionRequest } from '@dexa/contracts';
import { createDataTableColumnHelper } from '@dexa/ui';
import { formatOptionalClockTime } from '../utils/format-request-time.js';
import { REQUESTED_OUTCOME_TEXT } from '../utils/requests-messages.js';
import { ReviewerReasonCell, RequestStatusCell } from './request-cells.js';

const helper = createDataTableColumnHelper<CorrectionRequest>();

export const CORRECTION_REQUEST_COLUMNS = helper.columns([
  helper.display({
    id: 'date',
    header: 'Date',
    cell: ({ row }) => row.original.businessDate,
  }),
  helper.display({
    id: 'requestedOutcome',
    header: 'Requested outcome',
    cell: ({ row }) => REQUESTED_OUTCOME_TEXT[row.original.requestedDayStatus],
  }),
  helper.display({
    id: 'clockIn',
    header: 'Clock in',
    cell: ({ row }) => formatOptionalClockTime(row.original.clockInAt),
  }),
  helper.display({
    id: 'clockOut',
    header: 'Clock out',
    cell: ({ row }) => formatOptionalClockTime(row.original.clockOutAt),
  }),
  helper.display({
    id: 'reason',
    header: 'Reason',
    cell: ({ row }) => row.original.reason,
  }),
  helper.display({
    id: 'status',
    header: 'Status',
    cell: ({ row }) => <RequestStatusCell status={row.original.status} />,
  }),
  helper.display({
    id: 'reviewerReason',
    header: 'Reviewer reason',
    cell: ({ row }) => (
      <ReviewerReasonCell status={row.original.status} reviewReason={row.original.reviewReason} />
    ),
  }),
]);
