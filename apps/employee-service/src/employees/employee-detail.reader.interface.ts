import type { ProfileStatus } from '@dexa/contracts';

export const EMPLOYEE_DETAIL_READER = Symbol('IEmployeeDetailReader');

/** A master option as an employee response shows it. */
export type EmployeeDetailOptionRecord = {
  readonly id: string;
  readonly code: string;
  readonly name: string;
};

/** One saved employee profile with its position and employee status resolved. */
export type EmployeeDetailRecord = {
  readonly accountId: string;
  readonly name: string;
  readonly position: EmployeeDetailOptionRecord;
  readonly employeeStatus: EmployeeDetailOptionRecord;
  readonly phoneNumber: string | null;
  readonly profileStatus: ProfileStatus;
};

/** Reads the HR view of an employee profile. The email and role come from Auth, not from this port. */
export interface IEmployeeDetailReader {
  findEmployeeDetail(accountId: string): Promise<EmployeeDetailRecord | undefined>;
}
