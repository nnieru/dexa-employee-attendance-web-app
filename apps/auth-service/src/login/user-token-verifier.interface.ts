/** The verified claims of a refresh token: only the account it names, never a role. */
export type RefreshTokenSubject = {
  readonly accountId: string;
};

/**
 * Verifies refresh tokens with the public key of the user token pair. Only auth-service reads
 * refresh tokens; the gateway forwards them verbatim and never inspects one.
 */
export interface IUserTokenVerifier {
  verifyRefreshToken(token: string): Promise<RefreshTokenSubject>;
}

export const USER_TOKEN_VERIFIER = Symbol('IUserTokenVerifier');
