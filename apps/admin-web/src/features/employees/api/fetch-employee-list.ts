import {
  employeeListPageSchema,
  type EmployeeListPage,
  type EmployeeListQuery,
} from '@dexa/contracts';
import { parseResponse } from '@dexa/api-client';
import type { ApiClient } from '@dexa/session';

const EMPLOYEE_LIST_PATH = '/employees';

export async function fetchEmployeeList(
  apiClient: ApiClient,
  query: EmployeeListQuery,
): Promise<EmployeeListPage> {
  const response = await apiClient.get<unknown>(EMPLOYEE_LIST_PATH, { params: query });
  return parseResponse(employeeListPageSchema, response.data);
}
