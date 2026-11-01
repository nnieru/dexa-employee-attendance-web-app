import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { AttendanceSummaryPage, AttendanceSummaryQuery } from '@dexa/contracts';
import { useSession } from '@dexa/session';
import { getOwnAttendanceSummary } from '../api/get-own-attendance-summary.js';
import { summaryQueryKeys } from '../api/summary-query-keys.js';

/**
 * One page of the employee's own summary. The previous page stays on screen while the next one loads. A failure is
 * not retried silently: the table shows it with a Try again action. A query for an invalid range is not sent at all.
 */
export function useAttendanceSummary(
  query: AttendanceSummaryQuery,
  isEnabled: boolean,
): UseQueryResult<AttendanceSummaryPage, Error> {
  const { apiClient } = useSession();
  return useQuery({
    queryKey: summaryQueryKeys.list(query),
    queryFn: () => getOwnAttendanceSummary(apiClient, query),
    enabled: isEnabled,
    placeholderData: keepPreviousData,
    retry: false,
  });
}
