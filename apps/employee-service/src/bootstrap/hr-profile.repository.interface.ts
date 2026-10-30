import type { ProfileStatus } from '@dexa/contracts';

export const HR_PROFILE_REPOSITORY = Symbol('IHrProfileRepository');

/** A master option (position or employee status) found by its code, with its activation state. */
export type MasterOptionReference = {
  readonly id: string;
  readonly isActive: boolean;
};

export type NewHrProfile = {
  readonly accountId: string;
  readonly name: string;
  readonly positionId: string;
  readonly employeeStatusId: string;
  readonly profileStatus: ProfileStatus;
};

export type HrProfileInsertOutcome = 'CREATED' | 'ALREADY_PRESENT';

export interface IHrProfileRepository {
  findPositionByCode(code: string): Promise<MasterOptionReference | undefined>;
  findEmployeeStatusByCode(code: string): Promise<MasterOptionReference | undefined>;
  /** Inserts the profile unless one already exists for the account. An existing profile is never changed. */
  insertProfileIfAbsent(profile: NewHrProfile): Promise<HrProfileInsertOutcome>;
}
