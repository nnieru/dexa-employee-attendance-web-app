import {
  DEFAULT_PAGE_SIZE,
  type AttendanceMonitoringItem,
  type AttendanceMonitoringPage,
} from '@dexa/contracts';
import { DataTable, PageShell, type DataTableStatus } from '@dexa/ui';
import type { UseQueryResult } from '@tanstack/react-query';
import { useAttendanceMonitoring } from '../hooks/use-attendance-monitoring.js';
import { useEmployeeOptions } from '../hooks/use-employee-options.js';
import {
  resolveAttendanceMonitoringSearch,
  type AttendanceMonitoringSearch,
} from '../types/attendance-monitoring-search.schema.js';
import type { BusinessDate } from '../utils/business-date.js';
import { getAttendanceRangeError, type AttendanceRange } from '../utils/attendance-range.js';
import {
  ATTENDANCE_PAGE_DESCRIPTION,
  ATTENDANCE_PAGE_TITLE,
  ATTENDANCE_TABLE_CAPTION,
  INVALID_RANGE_TABLE_MESSAGE,
  getAttendanceEmptyMessage,
  getAttendanceTableStatus,
} from '../utils/attendance-monitoring-messages.js';
import { toAttendanceMonitoringQuery } from '../utils/to-attendance-monitoring-query.js';
import { ATTENDANCE_MONITORING_COLUMNS } from './attendance-monitoring-columns.js';
import { AttendanceMonitoringFilters } from './attendance-monitoring-filters.js';

type AttendanceMonitoringPageProps = {
  search: AttendanceMonitoringSearch;
  /** Today in the company timezone. The route reads the clock, so this page stays a pure function of its props. */
  today: BusinessDate;
  onRangeSearch: (range: AttendanceRange) => void;
  onEmployeeChange: (employeeId: string) => void;
  onPageChange: (page: number) => void;
};

const NO_ROWS: Array<AttendanceMonitoringItem> = [];

function getAttendanceRowId(item: AttendanceMonitoringItem): string {
  return `${item.accountId}:${item.businessDate}`;
}

/**
 * Attendance of all employees (PRD ADM-4), read only (ADM-6). The URL owns the range, the employee, and the page; this
 * component reflects them. No request is sent for a range that cannot be searched.
 */
export function AttendanceMonitoringPage({
  search,
  today,
  onRangeSearch,
  onEmployeeChange,
  onPageChange,
}: AttendanceMonitoringPageProps) {
  const resolvedSearch = resolveAttendanceMonitoringSearch(search, today);
  const range: AttendanceRange = { from: resolvedSearch.from, to: resolvedSearch.to };
  const isRangeValid = getAttendanceRangeError(range) === undefined;
  const monitoringQuery = useAttendanceMonitoring(
    toAttendanceMonitoringQuery(resolvedSearch),
    isRangeValid,
  );
  const employeeOptions = useEmployeeOptions();
  const page = isRangeValid ? monitoringQuery.data : undefined;

  return (
    <PageShell as="div" title={ATTENDANCE_PAGE_TITLE} description={ATTENDANCE_PAGE_DESCRIPTION}>
      <AttendanceMonitoringFilters
        range={range}
        today={today}
        employeeId={resolvedSearch.employeeId}
        employeeOptions={employeeOptions}
        onRangeSearch={onRangeSearch}
        onEmployeeChange={onEmployeeChange}
      />
      <DataTable
        caption={ATTENDANCE_TABLE_CAPTION}
        columns={ATTENDANCE_MONITORING_COLUMNS}
        data={page?.items ?? NO_ROWS}
        emptyMessage={
          isRangeValid
            ? getAttendanceEmptyMessage({
                range,
                isFilteredByEmployee: resolvedSearch.employeeId !== undefined,
              })
            : INVALID_RANGE_TABLE_MESSAGE
        }
        getRowId={getAttendanceRowId}
        pagination={{
          page: resolvedSearch.page,
          pageSize: DEFAULT_PAGE_SIZE,
          pageCount: page?.totalPages ?? 0,
          onPageChange,
        }}
        paginationSummary={page === undefined ? undefined : `Total: ${page.totalItems}`}
        status={getTableStatus(isRangeValid, monitoringQuery)}
      />
    </PageShell>
  );
}

function getTableStatus(
  isRangeValid: boolean,
  monitoringQuery: UseQueryResult<AttendanceMonitoringPage, Error>,
): DataTableStatus {
  if (!isRangeValid) return { kind: 'ready' };
  return getAttendanceTableStatus({
    isError: monitoringQuery.isError,
    isFetching: monitoringQuery.isFetching,
    isPending: monitoringQuery.isPending,
    onRetry: () => void monitoringQuery.refetch(),
  });
}
