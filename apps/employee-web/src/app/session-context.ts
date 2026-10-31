import { createContext, useContext } from 'react';
import type { ApiClient } from '../features/auth/types/api-client.js';
import type { SessionEndReason } from '../features/auth/types/session-end-reason.js';

// The token lives only in memory: never in localStorage or sessionStorage (AUTH-4, AGENTS §11). The
// account is not kept here; it is read from the React Query cache, which owns server data.
export type SessionState =
  | { status: 'signed-in'; accessToken: string }
  | { status: 'signed-out'; endReason: SessionEndReason | null };

export type SessionContextValue = {
  apiClient: ApiClient;
  session: SessionState;
  /** Reads the in-memory token synchronously, so it is current even before React re-renders. */
  isSignedIn: () => boolean;
  signIn: (accessToken: string) => void;
  /** The employee chose Logout: ends the session without a reason message. */
  signOut: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export const SessionContextProvider = SessionContext.Provider;

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (value === null) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
