import { currentAccountSchema, type CurrentAccount } from '@dexa/contracts';
import { parseResponse } from '@dexa/api-client';
import type { ApiClient } from '@dexa/session';

const CURRENT_ACCOUNT_PATH = '/auth/me';

/** The signed-in account. @dexa/session keeps no account identity in context, so the edit page asks for it. */
export async function fetchCurrentAccount(apiClient: ApiClient): Promise<CurrentAccount> {
  const response = await apiClient.get<unknown>(CURRENT_ACCOUNT_PATH);
  return parseResponse(currentAccountSchema, response.data);
}
