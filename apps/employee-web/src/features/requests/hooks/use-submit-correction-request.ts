import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  submitCorrectionRequestSchema,
  type CorrectionRequest,
  type SubmitCorrectionRequest,
} from '@dexa/contracts';
import { useSession } from '@dexa/session';
import { useRef } from 'react';
import { requestQueryKeys } from '../api/request-query-keys.js';
import { submitCorrectionRequest } from '../api/submit-correction-request.js';
import {
  createIdempotencyKey,
  resolveAttemptIdempotencyKey,
  type SubmittedAttempt,
} from '../utils/idempotency-key.js';
import type { CorrectionRequestPayload } from '../utils/correction-request-form.schema.js';

export type CorrectionSubmitHandlers = {
  onSubmitted: (request: CorrectionRequest) => void;
  onFailed: (error: unknown) => void;
};

/**
 * 'sent': the request left the browser. 'busy': an earlier request is still in flight, so nothing was sent.
 * 'refused': the request did not pass the shared contract, so nothing was sent.
 */
export type CorrectionSubmitResult = 'sent' | 'busy' | 'refused';

/**
 * Sends a correction request for this form session. The idempotency key rule is the one the overtime form uses
 * (resolveAttemptIdempotencyKey): the first send makes a key, an identical retry reuses it, and a changed payload gets a
 * new key. A refusal by the contract is not an attempt, so it keeps the earlier key. Success invalidates the own
 * correction lists and the single-date record, so the list and the panel show the new state.
 */
export function useSubmitCorrectionRequest() {
  const { apiClient } = useSession();
  const queryClient = useQueryClient();
  const lastAttemptRef = useRef<SubmittedAttempt<CorrectionRequestPayload> | null>(null);
  const isSendingRef = useRef(false);

  const mutation = useMutation({
    mutationFn: (request: SubmitCorrectionRequest) => submitCorrectionRequest(apiClient, request),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: requestQueryKeys.correctionLists() }),
        queryClient.invalidateQueries({ queryKey: requestQueryKeys.dayAttendanceLists() }),
      ]),
  });

  // The ref is set synchronously, so two submit events before the next render still send one request.
  function submit(
    payload: CorrectionRequestPayload,
    handlers: CorrectionSubmitHandlers,
  ): CorrectionSubmitResult {
    if (isSendingRef.current) return 'busy';
    const idempotencyKey = resolveAttemptIdempotencyKey(
      lastAttemptRef.current,
      payload,
      createIdempotencyKey,
    );
    const parsedRequest = submitCorrectionRequestSchema.safeParse({ ...payload, idempotencyKey });
    if (!parsedRequest.success) return 'refused';

    lastAttemptRef.current = { idempotencyKey, payload };
    isSendingRef.current = true;
    mutation.mutate(parsedRequest.data, {
      onSuccess: handlers.onSubmitted,
      onError: handlers.onFailed,
      onSettled: () => {
        isSendingRef.current = false;
      },
    });
    return 'sent';
  }

  return { isPending: mutation.isPending, submit };
}
