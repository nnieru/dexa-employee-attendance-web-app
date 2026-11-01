import { DEFAULT_PAGE_SIZE, type AttendanceSummaryQuery } from '@dexa/contracts';
import type { SummarySearch } from '../types/summary-search.schema.js';

/** The API query for one URL state. The page size is not in the URL, so it is the shared default. */
export function toAttendanceSummaryQuery(search: SummarySearch): AttendanceSummaryQuery {
  return {
    from: search.from,
    to: search.to,
    page: search.page,
    pageSize: DEFAULT_PAGE_SIZE,
  };
}
