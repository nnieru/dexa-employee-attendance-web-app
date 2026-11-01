import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { CorrectionRequestPage, OwnRequestListQuery } from '@dexa/contracts';
import { useSession } from '@dexa/session';
import { getOwnCorrectionRequests } from '../api/get-own-correction-requests.js';
import { requestQueryKeys } from '../api/request-query-keys.js';

/**
 * One page of the employee's own correction requests. The previous page stays on screen while the next one loads. A
 * failure is not retried silently: the table shows it with a Try again action.
 */
export function useOwnCorrectionRequests(
  query: OwnRequestListQuery,
): UseQueryResult<CorrectionRequestPage, Error> {
  const { apiClient } = useSession();
  return useQuery({
    queryKey: requestQueryKeys.correctionList(query),
    queryFn: () => getOwnCorrectionRequests(apiClient, query),
    placeholderData: keepPreviousData,
    retry: false,
  });
}
