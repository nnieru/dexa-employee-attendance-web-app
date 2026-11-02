import { useQuery } from '@tanstack/react-query';
import type { CurrentAccount } from '@dexa/contracts';
import { getCurrentAccount } from './get-current-account.js';
import { authQueryKeys } from './auth-query-keys.js';
import type { ApiClient } from '../session-http-client.js';

// An open app re-checks the session at least every 30 seconds and on window focus.
const SESSION_CHECK_INTERVAL_MS = 30_000;

type UseSessionCheckOptions = {
  apiClient: ApiClient;
  isEnabled: boolean;
  /** Runs with each account the check returns, so the session owner can end a session it must not keep. */
  onAccountChecked: (account: CurrentAccount) => void;
};

// A 401 is handled by the HTTP client's onSessionEnded, so this query only drives the timing. It does not
// retry: a failed check keeps the session, and the next focus or interval checks again.
export function useSessionCheck({
  apiClient,
  isEnabled,
  onAccountChecked,
}: UseSessionCheckOptions) {
  return useQuery({
    queryKey: authQueryKeys.currentAccount,
    queryFn: async () => {
      const account = await getCurrentAccount(apiClient);
      onAccountChecked(account);
      return account;
    },
    enabled: isEnabled,
    refetchOnWindowFocus: true,
    refetchInterval: SESSION_CHECK_INTERVAL_MS,
    retry: false,
  });
}
