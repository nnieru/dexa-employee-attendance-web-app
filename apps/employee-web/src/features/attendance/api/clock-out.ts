import { parseResponse } from '@dexa/api-client';
import { clockOutResponseSchema, type ClockOutResponse } from '@dexa/contracts';
import type { ApiClient } from '@dexa/session';

const CLOCK_OUT_PATH = '/attendance/clock-out';

/** Sends no body, for the same reason as clock-in: the server owns the instant. */
export async function clockOut(apiClient: ApiClient): Promise<ClockOutResponse> {
  const response = await apiClient.post<unknown>(CLOCK_OUT_PATH);
  return parseResponse(clockOutResponseSchema, response.data);
}
