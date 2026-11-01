import { parseResponse } from '@dexa/api-client';
import { todayAttendanceResponseSchema, type TodayAttendanceResponse } from '@dexa/contracts';
import type { ApiClient } from '@dexa/session';

const TODAY_ATTENDANCE_PATH = '/attendance/me/today';

export async function getTodayAttendance(apiClient: ApiClient): Promise<TodayAttendanceResponse> {
  const response = await apiClient.get<unknown>(TODAY_ATTENDANCE_PATH);
  return parseResponse(todayAttendanceResponseSchema, response.data);
}
