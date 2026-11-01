import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { EmployeeListPage } from '@dexa/contracts';
import { useSession } from '@dexa/session';
import { approvalQueryKeys } from '../api/approval-query-keys.js';
import { fetchEmployeeOptions } from '../api/fetch-employee-options.js';

/** The approvals employee filter's first page of employees. A failure shows a Try again action. */
export function useEmployeeOptions(): UseQueryResult<EmployeeListPage, Error> {
  const { apiClient } = useSession();
  return useQuery({
    queryKey: approvalQueryKeys.employeeOptions(),
    queryFn: () => fetchEmployeeOptions(apiClient),
    retry: false,
  });
}
