import {
  overtimeRequestSchema,
  type OvertimeRequest,
  type SubmitOvertimeRequest,
} from '@dexa/contracts';
import { parseResponse } from '@dexa/api-client';
import type { ApiClient } from '@dexa/session';

const OVERTIME_REQUESTS_PATH = '/overtime-requests';

/**
 * Sends one submission. The gateway answers 201 for a new request; an identical retry is answered with the stored
 * request, so any 2xx is a success for the caller. Errors reach the caller as ApiError.
 */
export async function submitOvertimeRequest(
  apiClient: ApiClient,
  request: SubmitOvertimeRequest,
): Promise<OvertimeRequest> {
  const response = await apiClient.post<unknown>(OVERTIME_REQUESTS_PATH, request);
  return parseResponse(overtimeRequestSchema, response.data);
}
