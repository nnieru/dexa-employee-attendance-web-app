import type { ProfileField, ProfileStatus } from '@dexa/contracts';
import type { LockedEmployeeProfile } from '../profile/employee-profile.writer.interface.js';
import { calculateProfileStatus } from '../profile/profile-completion.rules.js';

/** The status that the new photo implies and the fields that the change reports. */
export type OwnPhotoPlan = {
  readonly profileStatus: ProfileStatus;
  readonly changedFields: ReadonlyArray<ProfileField>;
};

/**
 * A new photo always changes the stored reference, so the photo is always reported. The status is reported
 * only when the photo moves it (DATABASE §4.1).
 */
export function planOwnPhotoChange(stored: LockedEmployeeProfile, photoKey: string): OwnPhotoPlan {
  const profileStatus = calculateProfileStatus({
    name: stored.name,
    positionId: stored.positionId,
    phoneNumber: stored.phoneNumber,
    photoKey,
  });
  const changedFields: ProfileField[] = ['photo'];
  if (profileStatus !== stored.profileStatus) changedFields.push('profileStatus');
  return { profileStatus, changedFields };
}
