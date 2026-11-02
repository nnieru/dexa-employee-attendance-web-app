import { useQueryClient } from '@tanstack/react-query';
import { ErrorCode, type CurrentAccount } from '@dexa/contracts';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useSessionCheck } from './auth/use-session-check.js';
import { postLogout } from './auth/post-logout.js';
import { postRefresh } from './auth/post-refresh.js';
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
 * Only an account whose role the app allows is ever kept: a login, refresh, or session check that
 * returns another role ends the session. A hard refresh restores the session from the refresh-token
 * cookie once, before the first protected route renders.
 */
export function SessionProvider({ children, config }: SessionProviderProps) {
  const { portal, allowedRoles, apiBaseUrl, onSessionEnded } = config;
  const queryClient = useQueryClient();
  const [session, setSession] = useState<SessionState>(SIGNED_OUT_WITHOUT_REASON);
  const accessTokenStore = useState(createAccessTokenStore)[0];

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

  const keepSession = useCallback(
    (accessToken: string, account: CurrentAccount) => {
      // A disallowed account never keeps a usable token. The flow gives no reason: the form only
      // says what this portal accepts, and no message reveals which role the account has.
      if (!allowedRoles.includes(account.role)) {
        endSession(ErrorCode.UNAUTHORIZED);
        return false;
      }
      accessTokenStore.set(accessToken);
      setSession({ status: 'signed-in', accessToken });
      return true;
    },
    [accessTokenStore, allowedRoles, endSession],
  );

  // The client needs the refresh call and the refresh call needs the client, so one initializer
  // builds them together and keeps them closed over. Every piece here is config-driven and stable
  // for the lifetime of the provider (each app memoizes its one SessionConfig), so the first-render
  // closures never go stale.
  const [sessionRuntime] = useState(() => {
    let refreshInFlight: Promise<boolean> | null = null;
    let hasRestored = false;
    const client = createSessionHttpClient({
      baseUrl: apiBaseUrl,
      getAccessToken: () => accessTokenStore.get(),
      refreshSession: () => refresh(),
      onSessionEnded: endSession,
    });

    // Single-flight: parallel 401s share one refresh, and the promise is dropped afterwards so a
    // later expiry refreshes again.
    async function refresh(): Promise<boolean> {
      if (refreshInFlight === null) {
        refreshInFlight = (async () => {
          try {
            const response = await postRefresh(client);
            return keepSession(response.accessToken, response.account);
          } catch {
            // A refused refresh ends the session through the HTTP client's own 401 handling, or
            // there is no session to end (the restore attempt); false lets the caller stop cleanly.
            return false;
          } finally {
            refreshInFlight = null;
          }
        })();
      }
      return refreshInFlight;
    }

    // One restore attempt per page load: a second call resolves immediately, a session that already
    // exists (a sign-in in the same load) is not re-fetched, and a failed attempt is not retried, so
    // a signed-out visitor lands on login without a loop.
    async function restore(): Promise<void> {
      if (hasRestored) return;
      hasRestored = true;
      if (accessTokenStore.get() !== null) return;
      await refresh();
    }

    return [client, refresh, restore] as const;
  });
  const apiClient = sessionRuntime[0];
  const restoreSession = sessionRuntime[2];

  // A session check that finds a disallowed account ends the session like a rejected token does.
  const handleAccountChecked = useCallback(
    (account: CurrentAccount) => {
      if (!allowedRoles.includes(account.role)) endSession(ErrorCode.UNAUTHORIZED);
    },
    [allowedRoles, endSession],
  );

  const isSignedIn = useCallback(() => accessTokenStore.get() !== null, [accessTokenStore]);

  const signIn = useCallback(
    (accessToken: string, account: CurrentAccount) => {
      keepSession(accessToken, account);
    },
    [keepSession],
  );

  const signOut = useCallback(() => {
    // Best effort: clearing the refresh-token cookie needs the server's Set-Cookie answer, but a
    // failed call must not keep the session open, so the local session always ends regardless.
    void postLogout(apiClient).catch(() => undefined);
    endSession(null);
  }, [apiClient, endSession]);

  useSessionCheck({
    apiClient,
    isEnabled: session.status === 'signed-in',
    onAccountChecked: handleAccountChecked,
  });

  const value = useMemo<SessionContextValue>(
    () => ({
      apiClient,
      portal,
      allowedRoles,
      session,
      isSignedIn,
      restoreSession,
      signIn,
      signOut,
    }),
    [apiClient, portal, allowedRoles, session, isSignedIn, restoreSession, signIn, signOut],
  );

  return <SessionContextProvider value={value}>{children}</SessionContextProvider>;
}
