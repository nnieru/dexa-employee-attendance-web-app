import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { WorkScheduleOverview } from '@dexa/contracts';
import { useSession } from '@dexa/session';
import { scheduleQueryKeys } from '../api/schedule-query-keys.js';
import { fetchWorkScheduleOverview } from '../api/fetch-work-schedule-overview.js';

/**
 * The schedule screen's data. A failure is shown with a Try again action rather than retried silently, so HR sees
 * that the schedule did not load.
 */
export function useWorkScheduleOverview(): UseQueryResult<WorkScheduleOverview, Error> {
  const { apiClient } = useSession();
  return useQuery({
    queryKey: scheduleQueryKeys.overview(),
    queryFn: () => fetchWorkScheduleOverview(apiClient),
    retry: false,
  });
}
