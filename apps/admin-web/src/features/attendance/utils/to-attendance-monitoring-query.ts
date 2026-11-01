import { DEFAULT_PAGE_SIZE, type AttendanceMonitoringQuery } from '@dexa/contracts';
import type { ResolvedAttendanceMonitoringSearch } from '../types/attendance-monitoring-search.schema.js';

/** The API query for one URL state. The page size is not in the URL, so it is the shared default. */
export function toAttendanceMonitoringQuery(
  search: ResolvedAttendanceMonitoringSearch,
): AttendanceMonitoringQuery {
  return {
    from: search.from,
    to: search.to,
    employeeId: search.employeeId,
    page: search.page,
    pageSize: DEFAULT_PAGE_SIZE,
  };
}
