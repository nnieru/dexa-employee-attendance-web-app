import { Link } from '@tanstack/react-router';
import { DEFAULT_PAGE_SIZE, type OvertimeRequestReviewItem } from '@dexa/contracts';
import { DataTable, StatusLabel, createDataTableColumnHelper } from '@dexa/ui';
import { useOvertimeApprovalQueue } from '../hooks/use-approval-queue.js';
import type { ResolvedApprovalsSearch } from '../types/approvals-search.schema.js';
import {
  getApprovalStatusDisplay,
  getRequesterName,
  formatApprovalInterval,
} from '../utils/approval-display.js';
import { formatApprovalDateTime } from '../utils/approval-time.js';
import {
  EMPTY_VALUE_TEXT,
  OVERTIME_TABLE_CAPTION,
  REVIEW_LINK_LABEL,
  getApprovalsEmptyMessage,
  getApprovalsTableStatus,
} from '../utils/approval-messages.js';
import { toReviewQueueQuery } from '../utils/to-review-queue-query.js';

const helper = createDataTableColumnHelper<OvertimeRequestReviewItem>();
const NO_ROWS: Array<OvertimeRequestReviewItem> = [];

const OVERTIME_COLUMNS = helper.columns([
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
    id: 'interval',
    header: 'Requested overtime',
    cell: ({ row }) => formatApprovalInterval(row.original.startAt, row.original.endAt),
  }),
  helper.display({
    id: 'current',
    header: 'Approved overtime',
    cell: ({ row }) => `${row.original.current.approvedMinutes} min`,
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
    cell: ({ row }) =>
      row.original.createdAt === null
        ? EMPTY_VALUE_TEXT
        : formatApprovalDateTime(row.original.createdAt),
  }),
  helper.display({
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => (
      <Link
        to="/approvals/$requestType/$requestId"
        params={{ requestType: 'overtime', requestId: row.original.id }}
        className="dexa-button dexa-button--secondary"
        aria-label={`${REVIEW_LINK_LABEL} overtime request of ${getRequesterName(
          row.original.requester,
        )}`}
      >
        {REVIEW_LINK_LABEL}
      </Link>
    ),
  }),
]);

type OvertimeApprovalTableProps = {
  search: ResolvedApprovalsSearch;
  onPageChange: (page: number) => void;
};

/** The overtime review queue. The URL owns the filters and the page; this table reflects them. */
export function OvertimeApprovalTable({ search, onPageChange }: OvertimeApprovalTableProps) {
  const queue = useOvertimeApprovalQueue(toReviewQueueQuery(search));
  const page = queue.data;

  return (
    <DataTable
      caption={OVERTIME_TABLE_CAPTION}
      columns={OVERTIME_COLUMNS}
      data={page?.items ?? NO_ROWS}
      emptyMessage={getApprovalsEmptyMessage('overtime', search.status)}
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
