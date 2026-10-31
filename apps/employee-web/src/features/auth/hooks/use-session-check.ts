import { useQuery } from '@tanstack/react-query';
import { getCurrentAccount } from '../api/get-current-account.js';
import { authQueryKeys } from '../api/auth-query-keys.js';
import type { ApiClient } from '../types/api-client.js';

// AUTH-5 and D-13: an open app re-checks the session at least every 30 seconds and on window focus.
const SESSION_CHECK_INTERVAL_MS = 30_000;

type UseSessionCheckOptions = {
  apiClient: ApiClient;
  isEnabled: boolean;
};

// A 401 is handled by the HTTP client's onUnauthorized, so this query only drives the timing. It does not
// retry: a failed check keeps the session, and the next focus or interval checks again.
export function useSessionCheck({ apiClient, isEnabled }: UseSessionCheckOptions) {
  return useQuery({
    queryKey: authQueryKeys.currentAccount,
    queryFn: () => getCurrentAccount(apiClient),
    enabled: isEnabled,
    refetchOnWindowFocus: true,
    refetchInterval: SESSION_CHECK_INTERVAL_MS,
    retry: false,
  });
}
