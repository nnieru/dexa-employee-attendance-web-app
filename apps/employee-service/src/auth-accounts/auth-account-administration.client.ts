import { INTERNAL_HTTP_CLIENT, ServiceName, type IInternalHttpClient } from '@dexa/common';
import {
  API_PREFIX,
  accountStatusSchema,
  type AccountStatus,
  type ResetAccountPasswordRequest,
  type SetAccountActiveStatusRequest,
} from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { IAuthAccountAdministrationClient } from './auth-account-administration-client.interface.js';

const ACCOUNTS_PATH = `/${API_PREFIX}/internal/accounts`;

// A PUT carries the caller's own service token only. The end user's token is never forwarded, because auth-service
// authorizes the calling service for these routes and checks the HR actor named in the body.
@Injectable()
export class AuthAccountAdministrationClient implements IAuthAccountAdministrationClient {
  constructor(@Inject(INTERNAL_HTTP_CLIENT) private readonly httpClient: IInternalHttpClient) {}

  async resetPassword(accountId: string, request: ResetAccountPasswordRequest): Promise<void> {
    await this.httpClient.putJson({
      target: ServiceName.AUTH_SERVICE,
      path: accountPath(accountId, 'password'),
      body: request,
      responseSchema: z.void(),
    });
  }

  setActiveStatus(
    accountId: string,
    request: SetAccountActiveStatusRequest,
  ): Promise<AccountStatus> {
    return this.httpClient.putJson({
      target: ServiceName.AUTH_SERVICE,
      path: accountPath(accountId, 'active-status'),
      body: request,
      responseSchema: accountStatusSchema,
    });
  }
}

function accountPath(accountId: string, action: 'password' | 'active-status'): string {
  return `${ACCOUNTS_PATH}/${encodeURIComponent(accountId)}/${action}`;
}
