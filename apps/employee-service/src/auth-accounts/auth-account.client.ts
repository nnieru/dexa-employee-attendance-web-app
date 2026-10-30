import { INTERNAL_HTTP_CLIENT, ServiceName, type IInternalHttpClient } from '@dexa/common';
import { API_PREFIX, accountLookupResponseSchema, type AccountLookupItem } from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { IAuthAccountClient } from './auth-account-client.interface.js';

const ACCOUNT_LOOKUP_PATH = `/${API_PREFIX}/internal/accounts/lookup`;

/**
 * Calls auth-service's batched lookup with this service's own token. The end user's token is never
 * forwarded: the lookup authorizes the calling service, and the account to read comes from the verified
 * token the caller already passed.
 */
@Injectable()
export class AuthAccountClient implements IAuthAccountClient {
  constructor(@Inject(INTERNAL_HTTP_CLIENT) private readonly httpClient: IInternalHttpClient) {}

  async findAccountById(accountId: string): Promise<AccountLookupItem | undefined> {
    const accounts = await this.httpClient.post({
      target: ServiceName.AUTH_SERVICE,
      path: ACCOUNT_LOOKUP_PATH,
      body: { ids: [accountId] },
      responseSchema: accountLookupResponseSchema,
    });
    // The lookup omits unknown and pending accounts, so an absent ID is the answer, not an error.
    return accounts.find((account) => account.id === accountId);
  }
}
