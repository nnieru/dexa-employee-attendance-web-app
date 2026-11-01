import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { AttendanceSummaryItem } from '@dexa/contracts';
import { useSession } from '@dexa/session';
import { getOwnDayAttendance } from '../api/get-own-day-attendance.js';
import { requestQueryKeys } from '../api/request-query-keys.js';
import type { BusinessDate } from '../utils/business-time.js';

/**
 * The employee's record for one business date, shown beside the correction form. It is read only when the date is
 * selectable, so an empty or out-of-window date sends no request. A failure is not retried silently; the panel shows it
 * with Try again and the form stays usable.
 */
export function useOwnDayAttendance(
  businessDate: BusinessDate,
  isEnabled: boolean,
): UseQueryResult<AttendanceSummaryItem | null, Error> {
  const { apiClient } = useSession();
  return useQuery({
    queryKey: requestQueryKeys.dayAttendance(businessDate),
    queryFn: () => getOwnDayAttendance(apiClient, businessDate),
    enabled: isEnabled,
    placeholderData: keepPreviousData,
    retry: false,
  });
}
