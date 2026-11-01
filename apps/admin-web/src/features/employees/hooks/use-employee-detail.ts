import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { EmployeeDetail } from '@dexa/contracts';
import { useSession } from '@dexa/session';
import { employeeQueryKeys } from '../api/employee-query-keys.js';
import { fetchEmployee } from '../api/fetch-employee.js';

/** One employee's HR view for the edit page (ADM-2). Failures are shown with a retry, so the query does not retry itself. */
export function useEmployeeDetail(accountId: string): UseQueryResult<EmployeeDetail, Error> {
  const { apiClient } = useSession();
  return useQuery({
    queryKey: employeeQueryKeys.detail(accountId),
    queryFn: () => fetchEmployee(apiClient, accountId),
    retry: false,
  });
}
