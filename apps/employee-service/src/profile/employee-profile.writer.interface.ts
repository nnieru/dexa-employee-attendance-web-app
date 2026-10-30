import type { ProfileStatus } from '@dexa/contracts';

export const EMPLOYEE_PROFILE_WRITER = Symbol('IEmployeeProfileWriter');

/** The stored columns that decide the profile status, read under a row lock before a change is decided. */
export type LockedEmployeeProfile = {
  readonly accountId: string;
  readonly name: string;
  readonly positionId: string;
  readonly employeeStatusId: string;
  readonly phoneNumber: string | null;
  readonly photoKey: string | null;
  readonly profileStatus: ProfileStatus;
};

/** The phone number and the status it implies, written together in one UPDATE. */
export type EmployeePhoneUpdate = {
  readonly accountId: string;
  readonly phoneNumber: string | null;
  readonly profileStatus: ProfileStatus;
};

/** The photo reference and the status it implies, written together in one UPDATE (DATABASE §4.2). */
export type EmployeePhotoUpdate = {
  readonly accountId: string;
  readonly photoKey: string;
  readonly profileStatus: ProfileStatus;
};

/**
 * The columns an HR update changes. A key is present only when its column changes, so an unchanged column is never
 * written. profileStatus is present only when the derived status moves.
 */
export type EmployeeFieldsChanges = {
  readonly name?: string;
  readonly positionId?: string;
  readonly phoneNumber?: string | null;
  readonly employeeStatusId?: string;
  readonly profileStatus?: ProfileStatus;
};

export type EmployeeFieldsUpdate = {
  readonly accountId: string;
  readonly changes: EmployeeFieldsChanges;
};

/** Writes that share one transaction, so the row lock and the update commit or roll back together. */
export interface IEmployeeProfileTransaction {
  lockProfileForUpdate(accountId: string): Promise<LockedEmployeeProfile | undefined>;
  updatePhone(update: EmployeePhoneUpdate): Promise<void>;
  updatePhoto(update: EmployeePhotoUpdate): Promise<void>;
  updateFields(update: EmployeeFieldsUpdate): Promise<void>;
}

/** Runs profile writes inside one transaction (DATABASE §4.1). Reads belong to IEmployeeProfileReader. */
export interface IEmployeeProfileWriter {
  runInTransaction<TResult>(
    work: (transaction: IEmployeeProfileTransaction) => Promise<TResult>,
  ): Promise<TResult>;
}
