import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { WorkCalendarDateListQuery, WorkCalendarDatePage } from '@dexa/contracts';
import { useSession } from '@dexa/session';
import { calendarExceptionQueryKeys } from '../api/calendar-exception-query-keys.js';
import { fetchCalendarExceptions } from '../api/fetch-calendar-exceptions.js';

/**
 * One page of calendar exceptions for one URL state. The previous page stays on screen while the next one loads. A
 * failure is not retried silently: the table shows it with a Try again action. A query for an invalid range is not sent.
 */
export function useCalendarExceptions(
  query: WorkCalendarDateListQuery,
  isEnabled: boolean,
): UseQueryResult<WorkCalendarDatePage, Error> {
  const { apiClient } = useSession();
  return useQuery({
    queryKey: calendarExceptionQueryKeys.list(query),
    queryFn: () => fetchCalendarExceptions(apiClient, query),
    enabled: isEnabled,
    placeholderData: keepPreviousData,
    retry: false,
  });
}
