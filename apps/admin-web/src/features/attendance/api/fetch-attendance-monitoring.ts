import {
  attendanceMonitoringPageSchema,
  type AttendanceMonitoringPage,
  type AttendanceMonitoringQuery,
} from '@dexa/contracts';
import { parseResponse } from '@dexa/api-client';
import type { ApiClient } from '@dexa/session';

const ATTENDANCE_MONITORING_PATH = '/attendance';

/** One page of every employee's attendance. The gateway accepts this only for HR. */
export async function fetchAttendanceMonitoring(
  apiClient: ApiClient,
  query: AttendanceMonitoringQuery,
): Promise<AttendanceMonitoringPage> {
  const response = await apiClient.get<unknown>(ATTENDANCE_MONITORING_PATH, { params: query });
  return parseResponse(attendanceMonitoringPageSchema, response.data);
}
