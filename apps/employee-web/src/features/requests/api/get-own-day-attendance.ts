import {
  attendanceSummaryPageSchema,
  type AttendanceSummaryItem,
  type AttendanceSummaryQuery,
} from '@dexa/contracts';
import { parseResponse } from '@dexa/api-client';
import type { ApiClient } from '@dexa/session';
import type { BusinessDate } from '../utils/business-time.js';

const OWN_SUMMARY_PATH = '/attendance/me';
// One business date has at most one row (DATABASE §5.4), so a single row is enough.
const DAY_RECORD_PAGE_SIZE = 1;

/**
 * The employee's own record for one business date, read from the own attendance summary with from and to set to the
 * same date. Resolves null when the date has no row. The summary is read here rather than imported from the History
 * feature, because features do not import each other (AGENTS §10).
 */
export async function getOwnDayAttendance(
  apiClient: ApiClient,
  businessDate: BusinessDate,
): Promise<AttendanceSummaryItem | null> {
  const query: AttendanceSummaryQuery = {
    from: businessDate,
    to: businessDate,
    page: 1,
    pageSize: DAY_RECORD_PAGE_SIZE,
  };
  const response = await apiClient.get<unknown>(OWN_SUMMARY_PATH, { params: query });
  const page = parseResponse(attendanceSummaryPageSchema, response.data);
  return page.items.find((item) => item.businessDate === businessDate) ?? null;
}
