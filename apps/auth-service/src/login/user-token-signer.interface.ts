import type { Role } from '@dexa/contracts';

// PRD AUTH-2 and DATABASE D-33: a user token lasts one hour. The lifetime is part of the contract that
// the login response reports, so it is defined here, next to the signer that enforces it.
export const USER_TOKEN_LIFETIME_SECONDS = 60 * 60;

export type UserTokenSubject = {
  readonly accountId: string;
  readonly role: Role;
};

/** Signs user access tokens. Only auth-service holds the private key, so no other service can mint one. */
export interface IUserTokenSigner {
  signAccessToken(subject: UserTokenSubject): Promise<string>;
  signRefreshToken(accountId: string): Promise<string>;
}

export const USER_TOKEN_SIGNER = Symbol('IUserTokenSigner');
