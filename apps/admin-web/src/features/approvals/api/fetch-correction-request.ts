import {
  correctionRequestReviewItemSchema,
  type CorrectionRequestReviewItem,
} from '@dexa/contracts';
import { parseResponse } from '@dexa/api-client';
import type { ApiClient } from '@dexa/session';

/** One correction request for the review detail screen (PRD APR-2). The gateway accepts this only for HR. */
export async function fetchCorrectionRequest(
  apiClient: ApiClient,
  requestId: string,
): Promise<CorrectionRequestReviewItem> {
  const response = await apiClient.get<unknown>(`/attendance-corrections/${requestId}`);
  return parseResponse(correctionRequestReviewItemSchema, response.data);
}
