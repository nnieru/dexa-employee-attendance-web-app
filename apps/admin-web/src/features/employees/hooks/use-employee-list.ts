import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { EmployeeListPage, EmployeeListQuery } from '@dexa/contracts';
import { useSession } from '@dexa/session';
import { employeeQueryKeys } from '../api/employee-query-keys.js';
import { fetchEmployeeList } from '../api/fetch-employee-list.js';

/**
 * The HR employee list for one URL state. The previous page stays on screen while the next one loads, so the
 * table can show a refreshing state instead of going blank. Failures are not retried silently: the table shows
 * its error with a Try again action at once.
 */
export function useEmployeeList(query: EmployeeListQuery): UseQueryResult<EmployeeListPage, Error> {
  const { apiClient } = useSession();
  return useQuery({
    queryKey: employeeQueryKeys.list(query),
    queryFn: () => fetchEmployeeList(apiClient, query),
    placeholderData: keepPreviousData,
    retry: false,
  });
}
