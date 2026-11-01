import {
  correctionRequestSchema,
  overtimeRequestSchema,
  type OvertimeRequest,
  type CorrectionRequest,
} from '@dexa/contracts';
import { parseResponse } from '@dexa/api-client';
import type { ApiClient } from '@dexa/session';

export type RequestDecision = 'approve' | 'reject';

export type RequestDecisionTarget = 'overtime' | 'correction';

const REQUEST_PATHS: Readonly<Record<RequestDecisionTarget, string>> = {
  overtime: '/overtime-requests',
  correction: '/attendance-corrections',
};

export type DecideRequestInput = {
  target: RequestDecisionTarget;
  requestId: string;
  decision: RequestDecision;
  reviewReason: string;
};

/**
 * Approves or rejects one request (PRD APR-2). The reviewer and the decision are sent from the browser; the server
 * derives the reviewer from the token and checks self-review and the terminal state again.
 */
export async function decideRequest(
  apiClient: ApiClient,
  input: DecideRequestInput,
): Promise<OvertimeRequest | CorrectionRequest> {
  const reviewReason = input.reviewReason.trim();
  const body = reviewReason.length === 0 ? {} : { reviewReason };
  const response = await apiClient.post<unknown>(
    `${REQUEST_PATHS[input.target]}/${input.requestId}/${input.decision}`,
    body,
  );
  return input.target === 'overtime'
    ? parseResponse(overtimeRequestSchema, response.data)
    : parseResponse(correctionRequestSchema, response.data);
}
