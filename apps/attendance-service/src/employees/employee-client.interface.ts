import type { EmployeeLookupItem } from '@dexa/contracts';

export const EMPLOYEE_CLIENT = Symbol('IEmployeeClient');

/**
 * Reads the Employee-owned names and positions of accounts. Employee owns the profiles, so this service
 * never reads that table.
 */
export interface IEmployeeClient {
  /**
   * Resolves the profiles that Employee knows among `accountIds` in one call. Unknown accounts are absent from the
   * answer. Callers pass at least one ID and at most EMPLOYEE_LOOKUP_MAX_IDS. Rejects when Employee is unavailable,
   * so an outage never reads as unknown accounts.
   */
  lookupEmployees(accountIds: ReadonlyArray<string>): Promise<EmployeeLookupItem[]>;
}
