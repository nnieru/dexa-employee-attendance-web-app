import type { CreateSessionResponse } from '@dexa/contracts';

/** Starts a new session from a valid refresh token, with the account read fresh from the database. */
export interface IRefreshSessionService {
  refreshSession(refreshToken: string): Promise<CreateSessionResponse>;
}

export const REFRESH_SESSION_SERVICE = Symbol('IRefreshSessionService');
