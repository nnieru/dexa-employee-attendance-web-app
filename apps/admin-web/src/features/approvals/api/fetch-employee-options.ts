import {
  employeeListPageSchema,
  MAX_PAGE_SIZE,
  type EmployeeListPage,
  type EmployeeListQuery,
} from '@dexa/contracts';
import { parseResponse } from '@dexa/api-client';
import type { ApiClient } from '@dexa/session';

const EMPLOYEE_LIST_PATH = '/employees';

// The filter needs names, not a search: the first page at the API's largest size keeps the request bounded.
const EMPLOYEE_OPTIONS_QUERY: EmployeeListQuery = { page: 1, pageSize: MAX_PAGE_SIZE };

/** The approvals employee filter's options, from the same employee list the HR employee screen reads (ADM-3). */
export async function fetchEmployeeOptions(apiClient: ApiClient): Promise<EmployeeListPage> {
  const response = await apiClient.get<unknown>(EMPLOYEE_LIST_PATH, {
    params: EMPLOYEE_OPTIONS_QUERY,
  });
  return parseResponse(employeeListPageSchema, response.data);
}
