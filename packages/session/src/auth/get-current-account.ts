import { currentAccountSchema, type CurrentAccount } from '@dexa/contracts';
import { parseResponse } from '@dexa/api-client';
import type { ApiClient } from '../session-http-client.js';

const CURRENT_ACCOUNT_PATH = '/auth/me';

export async function getCurrentAccount(apiClient: ApiClient): Promise<CurrentAccount> {
  const response = await apiClient.get<unknown>(CURRENT_ACCOUNT_PATH);
  return parseResponse(currentAccountSchema, response.data);
}
