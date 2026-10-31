import { useQueryClient } from '@tanstack/react-query';
import { createHttpClient, type ApiErrorCode } from '@dexa/api-client';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useSessionCheck } from '../features/auth/hooks/use-session-check.js';
import type { SessionEndReason } from '../features/auth/types/session-end-reason.js';
import { getSessionEndReason } from '../features/auth/utils/session-end-reason.js';
import { createAccessTokenStore } from './access-token-store.js';
import { API_BASE_URL } from './api-base-url.js';
import {
  SessionContextProvider,
  type SessionContextValue,
  type SessionState,
} from './session-context.js';

const SIGNED_OUT_WITHOUT_REASON: SessionState = { status: 'signed-out', endReason: null };

type SessionProviderProps = {
  children: ReactNode;
  /** Called after the session ends so the app can send the employee to login. */
  onSessionEnded: () => void;
};

/**
 * Owns the in-memory session and the one HTTP client that every API call uses, so every 401 reaches
 * the same handler. Mounted above the router, so the router can read the session in its guards.
 */
export function SessionProvider({ children, onSessionEnded }: SessionProviderProps) {
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
    createHttpClient({
      baseUrl: API_BASE_URL,
      getAccessToken: () => accessTokenStore.get(),
      onUnauthorized: (code: ApiErrorCode) => {
        const endReason = getSessionEndReason(code);
        // A 401 without a session (a failed login) is not a session end (D-13, INVALID_CREDENTIALS).
        if (endReason !== null && accessTokenStore.get() !== null) endSession(endReason);
      },
    }),
  );

  const isSignedIn = useCallback(() => accessTokenStore.get() !== null, [accessTokenStore]);

  const signIn = useCallback(
    (accessToken: string) => {
      accessTokenStore.set(accessToken);
      setSession({ status: 'signed-in', accessToken });
    },
    [accessTokenStore],
  );

  const signOut = useCallback(() => endSession(null), [endSession]);

  useSessionCheck({ apiClient, isEnabled: session.status === 'signed-in' });

  const value = useMemo<SessionContextValue>(
    () => ({ apiClient, session, isSignedIn, signIn, signOut }),
    [apiClient, session, isSignedIn, signIn, signOut],
  );

  return <SessionContextProvider value={value}>{children}</SessionContextProvider>;
}
