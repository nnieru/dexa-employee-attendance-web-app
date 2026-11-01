import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { CorrectionRequest, OvertimeRequest } from '@dexa/contracts';
import { useSession } from '@dexa/session';
import { decideRequest, type DecideRequestInput } from '../api/decide-request.js';
import { approvalQueryKeys } from '../api/approval-query-keys.js';

type DecideRequestResult = OvertimeRequest | CorrectionRequest;

/**
 * Approves or rejects one request. After a decision both lists are invalidated, because the row leaves a Pending
 * queue, and the detail is refetched so the screen shows the recorded status and review reason.
 */
export function useDecideRequest(): UseMutationResult<
  DecideRequestResult,
  Error,
  DecideRequestInput
> {
  const { apiClient } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DecideRequestInput) => decideRequest(apiClient, input),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: approvalQueryKeys.all })]);
    },
  });
}
