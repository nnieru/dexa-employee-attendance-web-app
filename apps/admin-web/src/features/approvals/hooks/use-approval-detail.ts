import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { CorrectionRequestReviewItem, OvertimeRequestReviewItem } from '@dexa/contracts';
import { useSession } from '@dexa/session';
import { approvalQueryKeys } from '../api/approval-query-keys.js';
import { fetchCorrectionRequest } from '../api/fetch-correction-request.js';
import { fetchOvertimeRequest } from '../api/fetch-overtime-request.js';
import type { ApprovalTab } from '../types/approvals-search.schema.js';

type ApprovalDetail = OvertimeRequestReviewItem | CorrectionRequestReviewItem;

/** One request for the review detail screen. A failure is shown with a Try again action. */
export function useApprovalDetail(
  tab: ApprovalTab,
  requestId: string,
  isEnabled: boolean,
): UseQueryResult<ApprovalDetail, Error> {
  const { apiClient } = useSession();
  return useQuery({
    queryKey:
      tab === 'overtime'
        ? approvalQueryKeys.overtime.detail(requestId)
        : approvalQueryKeys.correction.detail(requestId),
    queryFn: async (): Promise<ApprovalDetail> =>
      tab === 'overtime'
        ? fetchOvertimeRequest(apiClient, requestId)
        : fetchCorrectionRequest(apiClient, requestId),
    enabled: isEnabled,
    retry: false,
  });
}
