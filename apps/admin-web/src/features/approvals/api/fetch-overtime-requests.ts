import {
  overtimeRequestReviewPageSchema,
  type OvertimeRequestReviewPage,
  type RequestReviewQueueQuery,
} from '@dexa/contracts';
import { parseResponse } from '@dexa/api-client';
import type { ApiClient } from '@dexa/session';

const OVERTIME_REQUESTS_PATH = '/overtime-requests';

/** One page of the HR overtime review queue. The gateway accepts this only for HR. */
export async function fetchOvertimeRequests(
  apiClient: ApiClient,
  query: RequestReviewQueueQuery,
): Promise<OvertimeRequestReviewPage> {
  const response = await apiClient.get<unknown>(OVERTIME_REQUESTS_PATH, { params: query });
  return parseResponse(overtimeRequestReviewPageSchema, response.data);
}
