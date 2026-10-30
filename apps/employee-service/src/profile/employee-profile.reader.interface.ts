import type { ProfileStatus } from '@dexa/contracts';

export const EMPLOYEE_PROFILE_READER = Symbol('IEmployeeProfileReader');

/**
 * One employee row with its position resolved. photoKey is the stored reference: it is read here to
 * decide whether a photo exists, and it never leaves the service in a response.
 */
export type EmployeeProfileRecord = {
  readonly accountId: string;
  readonly name: string;
  readonly positionCode: string;
  readonly positionName: string;
  readonly phoneNumber: string | null;
  readonly photoKey: string | null;
  readonly profileStatus: ProfileStatus;
};

/** Read-only access to employee profiles. Writes belong to the profile write tasks, not to this port. */
export interface IEmployeeProfileReader {
  findProfileByAccountId(accountId: string): Promise<EmployeeProfileRecord | undefined>;
}
