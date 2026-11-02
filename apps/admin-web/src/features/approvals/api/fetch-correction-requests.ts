import {
  correctionRequestReviewPageSchema,
  type CorrectionRequestReviewPage,
  type RequestReviewQueueQuery,
} from '@dexa/contracts';
import { parseResponse } from '@dexa/api-client';
import type { ApiClient } from '@dexa/session';

const CORRECTION_REQUESTS_PATH = '/attendance-corrections';

/** One page of the HR correction review queue. The gateway accepts this only for HR. */
export async function fetchCorrectionRequests(
  apiClient: ApiClient,
  query: RequestReviewQueueQuery,
): Promise<CorrectionRequestReviewPage> {
  const response = await apiClient.get<unknown>(CORRECTION_REQUESTS_PATH, { params: query });
  return parseResponse(correctionRequestReviewPageSchema, response.data);
}
