import {
  overtimeRequestPageSchema,
  type OvertimeRequestPage,
  type OwnRequestListQuery,
} from '@dexa/contracts';
import { parseResponse } from '@dexa/api-client';
import type { ApiClient } from '@dexa/session';

const OWN_OVERTIME_REQUESTS_PATH = '/overtime-requests/me';

export async function getOwnOvertimeRequests(
  apiClient: ApiClient,
  query: OwnRequestListQuery,
): Promise<OvertimeRequestPage> {
  const response = await apiClient.get<unknown>(OWN_OVERTIME_REQUESTS_PATH, { params: query });
  return parseResponse(overtimeRequestPageSchema, response.data);
}
