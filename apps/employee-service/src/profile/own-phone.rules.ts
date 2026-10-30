import type { ProfileField, ProfileStatus } from '@dexa/contracts';
import type { LockedEmployeeProfile } from './employee-profile.writer.interface.js';
import { calculateProfileStatus } from './profile-completion.rules.js';

/** The write for a phone change: the new phone, the status it implies, and the fields the change reports. */
export type OwnPhonePlan = {
  readonly phoneNumber: string | null;
  readonly profileStatus: ProfileStatus;
  readonly changedFields: ReadonlyArray<ProfileField>;
};

/**
 * Returns undefined when the stored phone already equals the requested one, so nothing is written and no
 * change is reported. Otherwise the status is recomputed (DATABASE §4.1), and profileStatus is reported only
 * when it moves.
 */
export function planOwnPhoneChange(
  stored: LockedEmployeeProfile,
  phoneNumber: string | null,
): OwnPhonePlan | undefined {
  if (stored.phoneNumber === phoneNumber) return undefined;
  const profileStatus = calculateProfileStatus({
    name: stored.name,
    positionId: stored.positionId,
    phoneNumber,
    photoKey: stored.photoKey,
  });
  const changedFields: ProfileField[] = ['phoneNumber'];
  if (profileStatus !== stored.profileStatus) changedFields.push('profileStatus');
  return { phoneNumber, profileStatus, changedFields };
}
