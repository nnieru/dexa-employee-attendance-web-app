import { useQueryClient } from '@tanstack/react-query';
import { ErrorCode, type CurrentAccount } from '@dexa/contracts';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useSessionCheck } from './auth/use-session-check.js';
import type { SessionEndReason } from './auth/session-end-reason.js';
import { createAccessTokenStore } from './access-token-store.js';
import type { SessionConfig } from './session-config.js';
import { createSessionHttpClient } from './session-http-client.js';
import {
  SessionContextProvider,
  type SessionContextValue,
  type SessionState,
} from './session-context.js';

const SIGNED_OUT_WITHOUT_REASON: SessionState = { status: 'signed-out', endReason: null };

type SessionProviderProps = {
  children: ReactNode;
  config: SessionConfig;
};

/**
 * Owns the in-memory session and the one HTTP client that every API call uses, so every 401 reaches
 * the same handler. Mounted above the router, so the router can read the session in its guards.
 * Only an account whose role the app allows is ever kept: a login or session check that returns another
 * role ends the session.
 */
export function SessionProvider({ children, config }: SessionProviderProps) {
  const { portal, allowedRoles, apiBaseUrl, onSessionEnded } = config;
  const queryClient = useQueryClient();
  const [session, setSession] = useState<SessionState>(SIGNED_OUT_WITHOUT_REASON);
  const [accessTokenStore] = useState(createAccessTokenStore);

  const endSession = useCallback(
    (endReason: SessionEndReason | null) => {
      accessTokenStore.set(null);
      // Server data belongs to the signed-in session; drop it so the next account never sees it.
      queryClient.clear();
      setSession({ status: 'signed-out', endReason });
      onSessionEnded();
    },
    [accessTokenStore, queryClient, onSessionEnded],
  );

  const [apiClient] = useState(() =>
    createSessionHttpClient({
      baseUrl: apiBaseUrl,
      getAccessToken: () => accessTokenStore.get(),
      onSessionEnded: endSession,
    }),
  );

  const signIn = useCallback(
    (accessToken: string, account: CurrentAccount) => {
      // A disallowed account never keeps a usable token. The login gives no reason: the form only says what
      // this portal accepts, and no message reveals which role the account has.
      if (!allowedRoles.includes(account.role)) {
        endSession(null);
        return;
      }
      accessTokenStore.set(accessToken);
      setSession({ status: 'signed-in', accessToken });
    },
    [accessTokenStore, allowedRoles, endSession],
  );

  // A session check that finds a disallowed account ends the session like a rejected token does.
  const handleAccountChecked = useCallback(
    (account: CurrentAccount) => {
      if (!allowedRoles.includes(account.role)) endSession(ErrorCode.UNAUTHORIZED);
    },
    [allowedRoles, endSession],
  );

  const isSignedIn = useCallback(() => accessTokenStore.get() !== null, [accessTokenStore]);

  const signOut = useCallback(() => endSession(null), [endSession]);

  useSessionCheck({
    apiClient,
    isEnabled: session.status === 'signed-in',
    onAccountChecked: handleAccountChecked,
  });

  const value = useMemo<SessionContextValue>(
    () => ({ apiClient, portal, allowedRoles, session, isSignedIn, signIn, signOut }),
    [apiClient, portal, allowedRoles, session, isSignedIn, signIn, signOut],
  );

  return <SessionContextProvider value={value}>{children}</SessionContextProvider>;
}
