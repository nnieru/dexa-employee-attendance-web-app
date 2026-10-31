import { INTERNAL_HTTP_CLIENT, ServiceName, type IInternalHttpClient } from '@dexa/common';
import {
  API_PREFIX,
  MAX_PAGE_SIZE,
  accountIdPageSchema,
  type AccountIdPage,
} from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { IAuthClient } from './auth-client.interface.js';

const HR_RECIPIENTS_PATH = `/${API_PREFIX}/internal/accounts/hr-recipients`;

/**
 * Calls auth-service's internal HR recipient route with this service's own token. The route pages its answer, so the
 * client reads every page in order before it returns. A failed page rejects the whole call, so the caller never
 * inserts rows for a partial recipient list.
 */
@Injectable()
export class AuthClient implements IAuthClient {
  constructor(@Inject(INTERNAL_HTTP_CLIENT) private readonly httpClient: IInternalHttpClient) {}

  async listHrRecipientIds(): Promise<ReadonlyArray<string>> {
    const recipientIds: string[] = [];
    let page = 1;
    let answer = await this.fetchPage(page);
    recipientIds.push(...answer.items);
    while (page < answer.totalPages) {
      page += 1;
      answer = await this.fetchPage(page);
      recipientIds.push(...answer.items);
    }
    return recipientIds;
  }

  private fetchPage(page: number): Promise<AccountIdPage> {
    return this.httpClient.get({
      target: ServiceName.AUTH_SERVICE,
      path: HR_RECIPIENTS_PATH,
      query: { page: String(page), pageSize: String(MAX_PAGE_SIZE) },
      responseSchema: accountIdPageSchema,
    });
  }
}
