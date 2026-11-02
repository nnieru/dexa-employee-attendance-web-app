import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  submitOvertimeRequestSchema,
  type OvertimeRequest,
  type SubmitOvertimeRequest,
} from '@dexa/contracts';
import { useSession } from '@dexa/session';
import { useRef } from 'react';
import { requestQueryKeys } from '../api/request-query-keys.js';
import { submitOvertimeRequest } from '../api/submit-overtime-request.js';
import {
  createIdempotencyKey,
  resolveAttemptIdempotencyKey,
  type OvertimeRequestPayload,
  type SubmittedAttempt,
} from '../utils/idempotency-key.js';

export type OvertimeSubmitHandlers = {
  onSubmitted: (request: OvertimeRequest) => void;
  onFailed: (error: unknown) => void;
};

/**
 * 'sent': the request left the browser. 'busy': an earlier request is still in flight, so nothing was sent.
 * 'refused': the request did not pass the shared contract, so nothing was sent.
 */
export type OvertimeSubmitResult = 'sent' | 'busy' | 'refused';

/**
 * Sends an overtime request for this form session. The idempotency key rule lives here:
 * - the first submission makes a key; a form that is never submitted makes none, and a reopened form starts over;
 * - a retry whose content equals the last submitted attempt reuses that attempt's key, so the server answers the
 *   same request;
 * - a retry after the content changed gets a new key before it is sent, because the server refuses a reused key with
 *   different content;
 * - nothing is retried automatically, and a failed attempt keeps its key only for an identical retry.
 * Successful submission invalidates every own overtime list, so the list shows the new request.
 */
export function useSubmitOvertimeRequest() {
  const { apiClient } = useSession();
  const queryClient = useQueryClient();
  const lastAttemptRef = useRef<SubmittedAttempt<OvertimeRequestPayload> | null>(null);
  const isSendingRef = useRef(false);

  const mutation = useMutation({
    mutationFn: (request: SubmitOvertimeRequest) => submitOvertimeRequest(apiClient, request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: requestQueryKeys.overtimeLists() }),
  });

  // The ref is set synchronously, so two submit events before the next render still send one request.
  function submit(
    payload: OvertimeRequestPayload,
    handlers: OvertimeSubmitHandlers,
  ): OvertimeSubmitResult {
    if (isSendingRef.current) return 'busy';
    const idempotencyKey = resolveAttemptIdempotencyKey(
      lastAttemptRef.current,
      payload,
      createIdempotencyKey,
    );
    const parsedRequest = submitOvertimeRequestSchema.safeParse({ ...payload, idempotencyKey });
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
