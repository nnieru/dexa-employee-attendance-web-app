import { masterOptionListSchema, type MasterOption } from '@dexa/contracts';
import { parseResponse } from '@dexa/api-client';
import type { ApiClient } from '@dexa/session';

const EMPLOYEE_STATUSES_PATH = '/employee-statuses';

export async function fetchEmployeeStatuses(
  apiClient: ApiClient,
): Promise<ReadonlyArray<MasterOption>> {
  const response = await apiClient.get<unknown>(EMPLOYEE_STATUSES_PATH);
  return parseResponse(masterOptionListSchema, response.data);
}
