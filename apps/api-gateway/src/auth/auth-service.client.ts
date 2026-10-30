import { INTERNAL_HTTP_CLIENT, ServiceName, type IInternalHttpClient } from '@dexa/common';
import {
  API_PREFIX,
  ErrorCode,
  currentAccountSchema,
  loginResponseSchema,
  type ChangePasswordRequest,
  type CurrentAccount,
  type LoginRequest,
  type LoginResponse,
} from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { IAuthServiceClient } from './auth-service-client.interface.js';

// auth-service answers 401 with this code only when the email or password was refused. Any other 401
// means the gateway's own service token was refused, which stays a dependency failure.
const SESSION_REFUSAL_CODES = [ErrorCode.INVALID_CREDENTIALS];

// The gateway forwards the user's token on this call, so a 401 here means that token was refused: it is
// not expired, unknown, or belongs to a deactivated account. UNAUTHORIZED is never sent for the gateway's
// own service token, which this call does not carry.
const USER_TOKEN_REFUSAL_CODES = [ErrorCode.UNAUTHORIZED, ErrorCode.ACCOUNT_DISABLED];

@Injectable()
export class AuthServiceClient implements IAuthServiceClient {
  constructor(@Inject(INTERNAL_HTTP_CLIENT) private readonly httpClient: IInternalHttpClient) {}

  createSession(request: LoginRequest): Promise<LoginResponse> {
    return this.httpClient.post({
      target: ServiceName.AUTH_SERVICE,
      path: `/${API_PREFIX}/internal/sessions`,
      body: request,
      refusalCodes: SESSION_REFUSAL_CODES,
      responseSchema: loginResponseSchema,
    });
  }

  findCurrentAccount(accessToken: string): Promise<CurrentAccount> {
    return this.httpClient.get({
      target: ServiceName.AUTH_SERVICE,
      path: `/${API_PREFIX}/auth/me`,
      forwardedUserToken: accessToken,
      refusalCodes: USER_TOKEN_REFUSAL_CODES,
      responseSchema: currentAccountSchema,
    });
  }

  // auth-service answers 204, so there is no body to parse. A 400 CURRENT_PASSWORD_INCORRECT is not a
  // refusal of the token, so it reaches the browser as a validation error with its own code.
  changePassword(accessToken: string, request: ChangePasswordRequest): Promise<void> {
    return this.httpClient.patch({
      target: ServiceName.AUTH_SERVICE,
      path: `/${API_PREFIX}/auth/me/password`,
      body: request,
      forwardedUserToken: accessToken,
      refusalCodes: USER_TOKEN_REFUSAL_CODES,
      responseSchema: z.void(),
    });
  }
}
