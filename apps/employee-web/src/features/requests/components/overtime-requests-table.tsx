import { DEFAULT_PAGE_SIZE, type OvertimeRequest } from '@dexa/contracts';
import { DataTable } from '@dexa/ui';
import { useOwnOvertimeRequests } from '../hooks/use-own-overtime-requests.js';
import type { ResolvedRequestsSearch } from '../types/requests-search.schema.js';
import { getRequestTableStatus } from '../utils/get-request-table-status.js';
import { getRequestsEmptyMessage, OVERTIME_TABLE_CAPTION } from '../utils/requests-messages.js';
import { toOwnRequestListQuery } from '../utils/to-own-request-list-query.js';
import { OVERTIME_REQUEST_COLUMNS } from './overtime-request-columns.js';

type OvertimeRequestsTableProps = {
  search: ResolvedRequestsSearch;
  onPageChange: (page: number) => void;
};

const NO_ROWS: Array<OvertimeRequest> = [];

function getOvertimeRequestId(request: OvertimeRequest): string {
  return request.id;
}

/** The employee's overtime requests, one server page at a time (PRD APR-6). */
export function OvertimeRequestsTable({ search, onPageChange }: OvertimeRequestsTableProps) {
  const requestsQuery = useOwnOvertimeRequests(toOwnRequestListQuery(search));
  const page = requestsQuery.data;

  return (
    <DataTable
      caption={OVERTIME_TABLE_CAPTION}
      columns={OVERTIME_REQUEST_COLUMNS}
      data={page?.items ?? NO_ROWS}
      emptyMessage={getRequestsEmptyMessage('overtime', search.status)}
      getRowId={getOvertimeRequestId}
      pagination={{
        page: search.page,
        pageSize: DEFAULT_PAGE_SIZE,
        pageCount: page?.totalPages ?? 0,
        onPageChange,
      }}
      paginationSummary={page === undefined ? undefined : `Total: ${page.totalItems}`}
      status={getRequestTableStatus({
        isError: requestsQuery.isError,
        isFetching: requestsQuery.isFetching,
        isPending: requestsQuery.isPending,
        onRetry: () => void requestsQuery.refetch(),
      })}
    />
  );
}
