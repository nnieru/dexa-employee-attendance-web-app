import { Inject, Injectable } from '@nestjs/common';
import { API_PREFIX, accountStatusSchema, type AccountStatus } from '@dexa/contracts';
import {
  INTERNAL_HTTP_CLIENT,
  type IInternalHttpClient,
} from '../http/internal-http-client.interface.js';
import { NotFoundError } from '../errors/domain.errors.js';
import { ServiceName } from './service-name.js';
import type { IAccountStatusReader } from './account-status-reader.interface.js';

/**
 * Asks auth-service for an account's status with this service's own token. The user's token is never
 * forwarded here: the status route authorizes the calling service, not the user.
 */
@Injectable()
export class AuthServiceAccountStatusReader implements IAccountStatusReader {
  constructor(@Inject(INTERNAL_HTTP_CLIENT) private readonly httpClient: IInternalHttpClient) {}

  async findAccountStatus(accountId: string): Promise<AccountStatus | undefined> {
    try {
      return await this.httpClient.get({
        target: ServiceName.AUTH_SERVICE,
        path: `/${API_PREFIX}/internal/accounts/${encodeURIComponent(accountId)}/status`,
        responseSchema: accountStatusSchema,
      });
    } catch (error: unknown) {
      // auth-service answers 404 for an account that does not exist. Every other failure stays an error,
      // so an outage of auth-service never reads as an inactive account.
      if (error instanceof NotFoundError) return undefined;
      throw error;
    }
  }
}
