import {
  attendanceSummaryPageSchema,
  type AttendanceSummaryPage,
  type AttendanceSummaryQuery,
} from '@dexa/contracts';
import { parseResponse } from '@dexa/api-client';
import type { ApiClient } from '@dexa/session';

const OWN_SUMMARY_PATH = '/attendance/me';

export async function getOwnAttendanceSummary(
  apiClient: ApiClient,
  query: AttendanceSummaryQuery,
): Promise<AttendanceSummaryPage> {
  const response = await apiClient.get<unknown>(OWN_SUMMARY_PATH, { params: query });
  return parseResponse(attendanceSummaryPageSchema, response.data);
}
