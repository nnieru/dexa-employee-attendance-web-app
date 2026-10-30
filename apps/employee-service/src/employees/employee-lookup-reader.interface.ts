import type { EmployeeLookupItem } from '@dexa/contracts';

export const EMPLOYEE_LOOKUP_READER = Symbol('IEmployeeLookupReader');

/**
 * Reads the name and position name of the employees among `accountIds`. IDs without a profile are absent.
 * A profile still resolves when its position is inactive, because the catalog flag does not remove the profile.
 */
export interface IEmployeeLookupReader {
  findEmployeesByAccountIds(accountIds: ReadonlyArray<string>): Promise<EmployeeLookupItem[]>;
}
