import type { LoginRequest, LoginResponse } from '@dexa/contracts';

/** Verifies a sign-in request and issues the access token for the account it names. */
export interface ILoginService {
  login(request: LoginRequest): Promise<LoginResponse>;
}

export const LOGIN_SERVICE = Symbol('ILoginService');
