import type { OvertimeRequest } from '@dexa/contracts';
import { createDataTableColumnHelper } from '@dexa/ui';
import { formatRequestTimeRange } from '../utils/format-request-time.js';
import { NEXT_DAY_HINT_TEXT } from '../utils/requests-messages.js';
import { ReviewerReasonCell, RequestStatusCell } from './request-cells.js';

const helper = createDataTableColumnHelper<OvertimeRequest>();

export const OVERTIME_REQUEST_COLUMNS = helper.columns([
  helper.display({
    id: 'date',
    header: 'Date',
    cell: ({ row }) => row.original.businessDate,
  }),
  helper.display({
    id: 'time',
    header: 'Time',
    cell: ({ row }) => {
      const range = formatRequestTimeRange(
        row.original.startAt,
        row.original.endAt,
        row.original.businessDate,
      );
      return (
        <>
          {range.text}
          {range.isNextDay && (
            <>
              {' '}
              <span className="requests-next-day">{NEXT_DAY_HINT_TEXT}</span>
            </>
          )}
        </>
      );
    },
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
