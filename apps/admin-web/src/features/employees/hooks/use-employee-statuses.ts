import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { MasterOption } from '@dexa/contracts';
import { useSession } from '@dexa/session';
import { employeeQueryKeys } from '../api/employee-query-keys.js';
import { fetchEmployeeStatuses } from '../api/fetch-employee-statuses.js';

/** The employment status catalog for the create and update forms (ADM-1, ADM-2). */
export function useEmployeeStatuses(): UseQueryResult<ReadonlyArray<MasterOption>, Error> {
  const { apiClient } = useSession();
  return useQuery({
    queryKey: employeeQueryKeys.employeeStatuses(),
    queryFn: () => fetchEmployeeStatuses(apiClient),
    retry: false,
  });
}
