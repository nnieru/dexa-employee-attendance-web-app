import type { ProfileStatus } from '@dexa/contracts';

export const EMPLOYEE_LIST_READER = Symbol('IEmployeeListReader');

/** A master option as the list shows it: its ID, code, and name. */
export type EmployeeListOptionRecord = {
  readonly id: string;
  readonly code: string;
  readonly name: string;
};

/**
 * One employee row with both masters resolved. photoKey is read here only to decide whether a photo exists, and it
 * never leaves the service in a response.
 */
export type EmployeeListRecord = {
  readonly accountId: string;
  readonly name: string;
  readonly position: EmployeeListOptionRecord;
  readonly employeeStatus: EmployeeListOptionRecord;
  readonly phoneNumber: string | null;
  readonly photoKey: string | null;
  readonly profileStatus: ProfileStatus;
};

/**
 * The name term matches an employee's name as a case-insensitive substring. The email-matching IDs come from Auth
 * (D-15) and are combined with the name match in the same query, so pagination sees each employee once.
 */
export type EmployeeListSearch = {
  readonly nameTerm: string;
  readonly emailMatchAccountIds: ReadonlyArray<string>;
};

export type EmployeeListCriteria = {
  readonly page: number;
  readonly pageSize: number;
  /** Undefined lists every employee, in every employment status (D-14). */
  readonly search: EmployeeListSearch | undefined;
};

export type EmployeeListRecordPage = {
  readonly records: ReadonlyArray<EmployeeListRecord>;
  readonly totalItems: number;
};

/** Read-only access to the HR employee list. Writes belong to the profile and provisioning ports. */
export interface IEmployeeListReader {
  findEmployeePage(criteria: EmployeeListCriteria): Promise<EmployeeListRecordPage>;
}
