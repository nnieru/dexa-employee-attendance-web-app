import { createContext, useContext } from 'react';
import type { CurrentAccount, Portal, Role } from '@dexa/contracts';
import type { SessionEndReason } from './auth/session-end-reason.js';
import type { ApiClient } from './session-http-client.js';

// The token lives only in memory: never in localStorage or sessionStorage (AUTH-4, AGENTS §11). The
// account is not kept here; it is read from the React Query cache, which owns server data.
export type SessionState =
  | { status: 'signed-in'; accessToken: string }
  | { status: 'signed-out'; endReason: SessionEndReason | null };

export type SessionContextValue = {
  apiClient: ApiClient;
  portal: Portal;
  allowedRoles: ReadonlyArray<Role>;
  session: SessionState;
  /** Reads the in-memory token synchronously, so it is current even before React re-renders. */
  isSignedIn: () => boolean;
  /** Keeps the session only for an allowed role; any other account ends the session without keeping a token. */
  signIn: (accessToken: string, account: CurrentAccount) => void;
  /** The user chose Logout: ends the session without a reason message. */
  signOut: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export const SessionContextProvider = SessionContext.Provider;

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (value === null) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
