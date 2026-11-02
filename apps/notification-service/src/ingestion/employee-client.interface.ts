import type { EmployeeLookupItem } from '@dexa/contracts';

/**
 * Reads the Employee-owned names of accounts. Employee owns the profiles, so this service never reads
 * that table.
 */
export interface IEmployeeClient {
  /**
   * Resolves the profiles that Employee knows among `accountIds` in one call. Unknown accounts are absent from the
   * answer. Rejects when Employee is unavailable, so an outage never reads as unknown accounts.
   */
  lookupEmployees(accountIds: ReadonlyArray<string>): Promise<EmployeeLookupItem[]>;
}

export const EMPLOYEE_CLIENT = Symbol('IEmployeeClient');
