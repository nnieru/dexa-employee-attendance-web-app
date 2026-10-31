/**
 * Reads the accounts that auth-service owns (DATABASE §3). Notification never reads auth_db: recipients come only
 * through this port.
 */
export interface IAuthClient {
  /**
   * Resolves the IDs of every active HR account, including accounts that are offline (DATABASE §7). Rejects when
   * Auth is unavailable, so an outage never reads as "no recipients" and never leaves a partial list.
   */
  listHrRecipientIds(): Promise<ReadonlyArray<string>>;
}

export const AUTH_CLIENT = Symbol('IAuthClient');
