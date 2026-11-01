import { useState } from 'react';
import {
  DEFAULT_PAGE_SIZE,
  type AttendanceSummaryItem,
  type AttendanceSummaryPage,
} from '@dexa/contracts';
import { DataTable, DateRangeFilter, PageShell, type DataTableStatus } from '@dexa/ui';
import type { UseQueryResult } from '@tanstack/react-query';
import { useAttendanceSummary } from '../hooks/use-attendance-summary.js';
import type { BusinessDate, SummarySearch } from '../types/summary-search.schema.js';
import { toAttendanceSummaryQuery } from '../utils/to-attendance-summary-query.js';
import { getSummaryRangeError, type SummaryRange } from '../utils/summary-range.js';
import {
  INVALID_RANGE_TABLE_MESSAGE,
  SUMMARY_PAGE_DESCRIPTION,
  SUMMARY_PAGE_TITLE,
  SUMMARY_TABLE_CAPTION,
  getSummaryEmptyMessage,
  getSummaryTableStatus,
} from '../utils/summary-messages.js';
import { SUMMARY_COLUMNS } from './summary-columns.js';

type SummaryPageProps = {
  search: SummarySearch;
  /** Today in the company timezone, which the presets end on. */
  today: BusinessDate;
  onSearch: (range: SummaryRange) => void;
  onPageChange: (page: number) => void;
};

const NO_ROWS: Array<AttendanceSummaryItem> = [];

function getSummaryRowId(item: AttendanceSummaryItem): string {
  return item.businessDate;
}

/**
 * The employee's history (PRD SUM-1 to SUM-6). The URL owns the range and the page; this component reflects them.
 * A range is checked before it is searched, so an out-of-order range never reaches the API.
 */
export function SummaryPage({ search, today, onSearch, onPageChange }: SummaryPageProps) {
  // Set only by a rejected Search press. The range in the URL is checked on every render below.
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);
  const range: SummaryRange = { from: search.from, to: search.to };
  const urlRangeError = getSummaryRangeError(range);
  const isRangeValid = urlRangeError === undefined;
  const summaryQuery = useAttendanceSummary(toAttendanceSummaryQuery(search), isRangeValid);
  const page = isRangeValid ? summaryQuery.data : undefined;

  function handleSearch(draft: SummaryRange) {
    const draftError = getSummaryRangeError(draft);
    setSubmitError(draftError);
    if (draftError !== undefined) return;
    onSearch(draft);
  }

  return (
    <PageShell as="div" title={SUMMARY_PAGE_TITLE} description={SUMMARY_PAGE_DESCRIPTION}>
      <DateRangeFilter
        value={range}
        today={today}
        error={submitError ?? urlRangeError}
        onSearch={handleSearch}
        onReset={() => setSubmitError(undefined)}
      />
      <DataTable
        caption={SUMMARY_TABLE_CAPTION}
        columns={SUMMARY_COLUMNS}
        data={page?.items ?? NO_ROWS}
        emptyMessage={isRangeValid ? getSummaryEmptyMessage(range) : INVALID_RANGE_TABLE_MESSAGE}
        getRowId={getSummaryRowId}
        pagination={{
          page: search.page,
          pageSize: DEFAULT_PAGE_SIZE,
          pageCount: page?.totalPages ?? 0,
          onPageChange,
        }}
        paginationSummary={page === undefined ? undefined : `Total: ${page.totalItems}`}
        status={getTableStatus(isRangeValid, summaryQuery)}
      />
    </PageShell>
  );
}

function getTableStatus(
  isRangeValid: boolean,
  summaryQuery: UseQueryResult<AttendanceSummaryPage, Error>,
): DataTableStatus {
  if (!isRangeValid) return { kind: 'ready' };
  return getSummaryTableStatus({
    isError: summaryQuery.isError,
    isFetching: summaryQuery.isFetching,
    isPending: summaryQuery.isPending,
    onRetry: () => void summaryQuery.refetch(),
  });
}
