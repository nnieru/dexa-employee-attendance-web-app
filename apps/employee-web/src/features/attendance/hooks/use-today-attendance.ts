import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { TodayAttendanceResponse } from '@dexa/contracts';
import { useSession } from '@dexa/session';
import { attendanceQueryKeys } from '../api/attendance-query-keys.js';
import { getTodayAttendance } from '../api/get-today-attendance.js';

// A failure is shown with a retry action, so the query does not retry on its own. While the state is
// unknown the page shows no action, so the employee never punches on a state that was not read.
export function useTodayAttendance(): UseQueryResult<TodayAttendanceResponse> {
  const { apiClient } = useSession();
  return useQuery({
    queryKey: attendanceQueryKeys.today(),
    queryFn: () => getTodayAttendance(apiClient),
    retry: false,
  });
}
