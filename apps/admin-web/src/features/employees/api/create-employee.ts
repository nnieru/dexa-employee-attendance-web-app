import {
  employeeDetailSchema,
  type CreateEmployeeRequest,
  type EmployeeDetail,
} from '@dexa/contracts';
import { parseResponse } from '@dexa/api-client';
import type { ApiClient } from '@dexa/session';

const EMPLOYEES_PATH = '/employees';

/** Creates the employee. The response is the saved employee as the server stores it. */
export async function createEmployee(
  apiClient: ApiClient,
  request: CreateEmployeeRequest,
): Promise<EmployeeDetail> {
  const response = await apiClient.post<unknown>(EMPLOYEES_PATH, request);
  return parseResponse(employeeDetailSchema, response.data);
}
