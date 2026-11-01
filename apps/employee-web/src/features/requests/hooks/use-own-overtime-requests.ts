import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { OvertimeRequestPage, OwnRequestListQuery } from '@dexa/contracts';
import { useSession } from '@dexa/session';
import { getOwnOvertimeRequests } from '../api/get-own-overtime-requests.js';
import { requestQueryKeys } from '../api/request-query-keys.js';

/**
 * One page of the employee's own overtime requests. The previous page stays on screen while the next one loads. A
 * failure is not retried silently: the table shows it with a Try again action.
 */
export function useOwnOvertimeRequests(
  query: OwnRequestListQuery,
): UseQueryResult<OvertimeRequestPage, Error> {
  const { apiClient } = useSession();
  return useQuery({
    queryKey: requestQueryKeys.overtimeList(query),
    queryFn: () => getOwnOvertimeRequests(apiClient, query),
    placeholderData: keepPreviousData,
    retry: false,
  });
}
