import { INTERNAL_HTTP_CLIENT, ServiceName, type IInternalHttpClient } from '@dexa/common';
import { API_PREFIX, accountStatusSchema, type AccountStatus } from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { IAccountStatusClient } from './account-status-client.interface.js';

@Injectable()
export class AccountStatusClient implements IAccountStatusClient {
  constructor(@Inject(INTERNAL_HTTP_CLIENT) private readonly httpClient: IInternalHttpClient) {}

  getAccountStatus(accountId: string): Promise<AccountStatus> {
    return this.httpClient.get({
      target: ServiceName.AUTH_SERVICE,
      path: `/${API_PREFIX}/internal/accounts/${encodeURIComponent(accountId)}/status`,
      responseSchema: accountStatusSchema,
    });
  }
}
