import { overtimeRequestReviewItemSchema, type OvertimeRequestReviewItem } from '@dexa/contracts';
import { parseResponse } from '@dexa/api-client';
import type { ApiClient } from '@dexa/session';

/** One overtime request for the review detail screen. The gateway accepts this only for HR. */
export async function fetchOvertimeRequest(
  apiClient: ApiClient,
  requestId: string,
): Promise<OvertimeRequestReviewItem> {
  const response = await apiClient.get<unknown>(`/overtime-requests/${requestId}`);
  return parseResponse(overtimeRequestReviewItemSchema, response.data);
}
