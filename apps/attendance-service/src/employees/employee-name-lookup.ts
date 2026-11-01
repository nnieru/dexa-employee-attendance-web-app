import type { IEmployeeClient } from './employee-client.interface.js';

/**
 * Resolves the names of the accounts on one page with one batched call (DATABASE §8). Callers pass a page, which is
 * bounded by MAX_PAGE_SIZE and so fits in one lookup (EMPLOYEE_LOOKUP_MAX_IDS). An account that Employee does not know
 * is absent from the map, and the caller shows it as unnamed. An empty page makes no call, because the lookup refuses
 * an empty ID list.
 */
export async function findEmployeeNamesByAccountId(
  employees: IEmployeeClient,
  accountIds: ReadonlyArray<string>,
): Promise<ReadonlyMap<string, string>> {
  const distinctAccountIds = [...new Set(accountIds)];
  if (distinctAccountIds.length === 0) return new Map();
  const profiles = await employees.lookupEmployees(distinctAccountIds);
  return new Map(profiles.map((profile) => [profile.accountId, profile.name]));
}
