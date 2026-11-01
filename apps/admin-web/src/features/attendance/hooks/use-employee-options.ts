import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { EmployeeListPage } from '@dexa/contracts';
import { useSession } from '@dexa/session';
import { attendanceQueryKeys } from '../api/attendance-query-keys.js';
import { fetchEmployeeOptions } from '../api/fetch-employee-options.js';

/** The employee filter's first page of employees. A failure shows a Try again action beside the filter. */
export function useEmployeeOptions(): UseQueryResult<EmployeeListPage, Error> {
  const { apiClient } = useSession();
  return useQuery({
    queryKey: attendanceQueryKeys.employeeOptions(),
    queryFn: () => fetchEmployeeOptions(apiClient),
    retry: false,
  });
}
