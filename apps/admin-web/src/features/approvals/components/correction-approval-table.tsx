import { Link } from '@tanstack/react-router';
import { DEFAULT_PAGE_SIZE, type CorrectionRequestReviewItem } from '@dexa/contracts';
import { DataTable, StatusLabel, createDataTableColumnHelper } from '@dexa/ui';
import { useCorrectionApprovalQueue } from '../hooks/use-approval-queue.js';
import type { ResolvedApprovalsSearch } from '../types/approvals-search.schema.js';
import {
  DAY_STATUS_TEXT,
  REQUESTED_OUTCOME_TEXT,
  formatOptionalTime,
  getApprovalStatusDisplay,
  getRequesterName,
} from '../utils/approval-display.js';
import { formatApprovalDateTime, formatApprovalTime } from '../utils/approval-time.js';
import {
  CORRECTION_TABLE_CAPTION,
  EMPTY_VALUE_TEXT,
  REVIEW_LINK_LABEL,
  getApprovalsEmptyMessage,
  getApprovalsTableStatus,
} from '../utils/approval-messages.js';
import { toReviewQueueQuery } from '../utils/to-review-queue-query.js';

const helper = createDataTableColumnHelper<CorrectionRequestReviewItem>();
const NO_ROWS: Array<CorrectionRequestReviewItem> = [];

function formatRequestedTimes(item: CorrectionRequestReviewItem): string {
  if (item.requestedDayStatus !== 'PRESENT') return EMPTY_VALUE_TEXT;
  const clockOut = item.clockOutAt === null ? '' : `–${formatApprovalTime(item.clockOutAt)}`;
  return `${formatOptionalTime(item.clockInAt)}${clockOut}`;
}

const CORRECTION_COLUMNS = helper.columns([
  helper.display({
    id: 'requester',
    header: 'Requester',
    cell: ({ row }) => getRequesterName(row.original.requester),
  }),
  helper.display({
    id: 'businessDate',
    header: 'Date',
    cell: ({ row }) => row.original.businessDate,
  }),
  helper.display({
    id: 'current',
    header: 'Current',
    cell: ({ row }) =>
      `${DAY_STATUS_TEXT[row.original.current.dayStatus]} · ${formatOptionalTime(
        row.original.current.clockInAt,
      )}–${formatOptionalTime(row.original.current.clockOutAt)}`,
  }),
  helper.display({
    id: 'requested',
    header: 'Requested',
    cell: ({ row }) =>
      `${REQUESTED_OUTCOME_TEXT[row.original.requestedDayStatus]} · ${formatRequestedTimes(
        row.original,
      )}`,
  }),
  helper.display({
    id: 'reason',
    header: 'Reason',
    cell: ({ row }) => row.original.reason,
  }),
  helper.display({
    id: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const display = getApprovalStatusDisplay(row.original.status);
      return <StatusLabel tone={display.tone}>{display.text}</StatusLabel>;
    },
  }),
  helper.display({
    id: 'submitted',
    header: 'Submitted',
    cell: ({ row }) => formatApprovalDateTime(row.original.createdAt),
  }),
  helper.display({
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => (
      <Link
        to="/approvals/$requestType/$requestId"
        params={{ requestType: 'correction', requestId: row.original.id }}
        className="dexa-button dexa-button--secondary"
        aria-label={`${REVIEW_LINK_LABEL} correction request of ${getRequesterName(
          row.original.requester,
        )}`}
      >
        {REVIEW_LINK_LABEL}
      </Link>
    ),
  }),
]);

type CorrectionApprovalTableProps = {
  search: ResolvedApprovalsSearch;
  onPageChange: (page: number) => void;
};

/** The correction review queue. The URL owns the filters and the page; this table reflects them. */
export function CorrectionApprovalTable({ search, onPageChange }: CorrectionApprovalTableProps) {
  const queue = useCorrectionApprovalQueue(toReviewQueueQuery(search));
  const page = queue.data;

  return (
    <DataTable
      caption={CORRECTION_TABLE_CAPTION}
      columns={CORRECTION_COLUMNS}
      data={page?.items ?? NO_ROWS}
      emptyMessage={getApprovalsEmptyMessage('corrections', search.status)}
      getRowId={(item) => item.id}
      pagination={{
        page: search.page,
        pageSize: DEFAULT_PAGE_SIZE,
        pageCount: page?.totalPages ?? 0,
        onPageChange,
      }}
      paginationSummary={page === undefined ? undefined : `Total: ${page.totalItems}`}
      status={getApprovalsTableStatus({
        isError: queue.isError,
        isFetching: queue.isFetching,
        isPending: queue.isPending,
        onRetry: () => void queue.refetch(),
      })}
    />
  );
}
