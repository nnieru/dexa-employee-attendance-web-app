import type { CreateSessionResponse, LoginRequest } from '@dexa/contracts';

/** Verifies a sign-in request and issues the session tokens for the account it names. */
export interface ILoginService {
  login(request: LoginRequest): Promise<CreateSessionResponse>;
}

export const LOGIN_SERVICE = Symbol('ILoginService');
