import { DEFAULT_PAGE_SIZE, type CorrectionRequest } from '@dexa/contracts';
import { DataTable } from '@dexa/ui';
import { useOwnCorrectionRequests } from '../hooks/use-own-correction-requests.js';
import type { ResolvedRequestsSearch } from '../types/requests-search.schema.js';
import { getRequestTableStatus } from '../utils/get-request-table-status.js';
import { CORRECTION_TABLE_CAPTION, getRequestsEmptyMessage } from '../utils/requests-messages.js';
import { toOwnRequestListQuery } from '../utils/to-own-request-list-query.js';
import { CORRECTION_REQUEST_COLUMNS } from './correction-request-columns.js';

type CorrectionRequestsTableProps = {
  search: ResolvedRequestsSearch;
  onPageChange: (page: number) => void;
};

const NO_ROWS: Array<CorrectionRequest> = [];

function getCorrectionRequestId(request: CorrectionRequest): string {
  return request.id;
}

/** The employee's correction requests, one server page at a time (PRD APR-6). */
export function CorrectionRequestsTable({ search, onPageChange }: CorrectionRequestsTableProps) {
  const requestsQuery = useOwnCorrectionRequests(toOwnRequestListQuery(search));
  const page = requestsQuery.data;

  return (
    <DataTable
      caption={CORRECTION_TABLE_CAPTION}
      columns={CORRECTION_REQUEST_COLUMNS}
      data={page?.items ?? NO_ROWS}
      emptyMessage={getRequestsEmptyMessage('corrections', search.status)}
      getRowId={getCorrectionRequestId}
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
