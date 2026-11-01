import {
  correctionRequestSchema,
  type CorrectionRequest,
  type SubmitCorrectionRequest,
} from '@dexa/contracts';
import { parseResponse } from '@dexa/api-client';
import type { ApiClient } from '@dexa/session';

const CORRECTION_REQUESTS_PATH = '/attendance-corrections';

/**
 * Sends one submission. The gateway answers 201 for a new request; an identical retry is answered with the stored
 * request, so any 2xx is a success for the caller. Errors reach the caller as ApiError.
 */
export async function submitCorrectionRequest(
  apiClient: ApiClient,
  request: SubmitCorrectionRequest,
): Promise<CorrectionRequest> {
  const response = await apiClient.post<unknown>(CORRECTION_REQUESTS_PATH, request);
  return parseResponse(correctionRequestSchema, response.data);
}
