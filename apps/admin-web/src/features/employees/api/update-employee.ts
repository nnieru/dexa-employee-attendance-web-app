import {
  employeeDetailSchema,
  type EmployeeDetail,
  type UpdateEmployeeRequest,
} from '@dexa/contracts';
import { parseResponse } from '@dexa/api-client';
import type { ApiClient } from '@dexa/session';

const EMPLOYEES_PATH = '/employees';

/** Sends HR's changes. The request carries only the fields that changed (see toUpdateEmployeeRequest). */
export async function updateEmployee(
  apiClient: ApiClient,
  accountId: string,
  request: UpdateEmployeeRequest,
): Promise<EmployeeDetail> {
  const response = await apiClient.patch<unknown>(
    `${EMPLOYEES_PATH}/${encodeURIComponent(accountId)}`,
    request,
  );
  return parseResponse(employeeDetailSchema, response.data);
}
