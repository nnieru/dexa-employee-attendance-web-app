import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import type {
  CorrectionRequestReviewPage,
  OvertimeRequestReviewPage,
  RequestReviewQueueQuery,
} from '@dexa/contracts';
import { useSession } from '@dexa/session';
import { approvalQueryKeys } from '../api/approval-query-keys.js';
import { fetchCorrectionRequests } from '../api/fetch-correction-requests.js';
import { fetchOvertimeRequests } from '../api/fetch-overtime-requests.js';

/**
 * One page of the overtime review queue. The previous page stays on screen while the next one loads. A failure is not
 * retried silently: the table shows it with a Try again action.
 */
export function useOvertimeApprovalQueue(
  query: RequestReviewQueueQuery,
): UseQueryResult<OvertimeRequestReviewPage, Error> {
  const { apiClient } = useSession();
  return useQuery({
    queryKey: approvalQueryKeys.overtime.list(query),
    queryFn: () => fetchOvertimeRequests(apiClient, query),
    placeholderData: keepPreviousData,
    retry: false,
  });
}

/** One page of the correction review queue, with the same loading and error behaviour as the overtime queue. */
export function useCorrectionApprovalQueue(
  query: RequestReviewQueueQuery,
): UseQueryResult<CorrectionRequestReviewPage, Error> {
  const { apiClient } = useSession();
  return useQuery({
    queryKey: approvalQueryKeys.correction.list(query),
    queryFn: () => fetchCorrectionRequests(apiClient, query),
    placeholderData: keepPreviousData,
    retry: false,
  });
}
