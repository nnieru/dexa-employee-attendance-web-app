import { employeeDetailSchema, type EmployeeDetail } from '@dexa/contracts';
import { parseResponse } from '@dexa/api-client';
import type { ApiClient } from '@dexa/session';

const EMPLOYEES_PATH = '/employees';

/** Loads one employee's HR view for the edit page. */
export async function fetchEmployee(
  apiClient: ApiClient,
  accountId: string,
): Promise<EmployeeDetail> {
  const response = await apiClient.get<unknown>(
    `${EMPLOYEES_PATH}/${encodeURIComponent(accountId)}`,
  );
  return parseResponse(employeeDetailSchema, response.data);
}
