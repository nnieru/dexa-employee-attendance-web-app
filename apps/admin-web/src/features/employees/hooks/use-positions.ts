import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { MasterOption } from '@dexa/contracts';
import { useSession } from '@dexa/session';
import { employeeQueryKeys } from '../api/employee-query-keys.js';
import { fetchPositions } from '../api/fetch-positions.js';

/** The position catalog for the create and update forms. */
export function usePositions(): UseQueryResult<ReadonlyArray<MasterOption>, Error> {
  const { apiClient } = useSession();
  return useQuery({
    queryKey: employeeQueryKeys.positions(),
    queryFn: () => fetchPositions(apiClient),
    retry: false,
  });
}
