import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { CurrentAccount } from '@dexa/contracts';
import { useSession } from '@dexa/session';
import { employeeQueryKeys } from '../api/employee-query-keys.js';
import { fetchCurrentAccount } from '../api/fetch-current-account.js';

/** The signed-in HR account. Used to disable the status control on the HR's own account. */
export function useCurrentAccount(): UseQueryResult<CurrentAccount, Error> {
  const { apiClient } = useSession();
  return useQuery({
    queryKey: employeeQueryKeys.currentAccount(),
    queryFn: () => fetchCurrentAccount(apiClient),
    retry: false,
  });
}
