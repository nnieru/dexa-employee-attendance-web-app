import { parseResponse } from '@dexa/api-client';
import { clockInResponseSchema, type ClockInResponse } from '@dexa/contracts';
import type { ApiClient } from '@dexa/session';

const CLOCK_IN_PATH = '/attendance/clock-in';

/**
 * Sends no body: the server sets the instant and every status. The client never sends a time, so
 * the response's recordedAt is the only instant the screen may show.
 */
export async function clockIn(apiClient: ApiClient): Promise<ClockInResponse> {
  const response = await apiClient.post<unknown>(CLOCK_IN_PATH);
  return parseResponse(clockInResponseSchema, response.data);
}
