import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { AttendanceMonitoringPage, AttendanceMonitoringQuery } from '@dexa/contracts';
import { useSession } from '@dexa/session';
import { attendanceQueryKeys } from '../api/attendance-query-keys.js';
import { fetchAttendanceMonitoring } from '../api/fetch-attendance-monitoring.js';

/**
 * One page of the monitoring list for one URL state. The previous page stays on screen while the next one loads.
 * A failure is not retried silently: the table shows it with a Try again action. A query for an invalid range is
 * not sent at all.
 */
export function useAttendanceMonitoring(
  query: AttendanceMonitoringQuery,
  isEnabled: boolean,
): UseQueryResult<AttendanceMonitoringPage, Error> {
  const { apiClient } = useSession();
  return useQuery({
    queryKey: attendanceQueryKeys.list(query),
    queryFn: () => fetchAttendanceMonitoring(apiClient, query),
    enabled: isEnabled,
    placeholderData: keepPreviousData,
    retry: false,
  });
}
