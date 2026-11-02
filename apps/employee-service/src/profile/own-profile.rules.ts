import { API_PREFIX, type OwnProfile } from '@dexa/contracts';
import type { EmployeeProfileRecord } from './employee-profile.reader.interface.js';

// The photo is served by the authenticated resource, so the metadata carries only this relative URL.
export const OWN_PHOTO_URL = `/${API_PREFIX}/employees/me/photo`;

/**
 * Builds the response from the employee row and the company email that Auth owns. The photo key is read
 * only to decide whether the photo URL exists, so the response never carries the stored key.
 */
export function toOwnProfile(profile: EmployeeProfileRecord, email: string): OwnProfile {
  return {
    accountId: profile.accountId,
    name: profile.name,
    email,
    position: { code: profile.positionCode, name: profile.positionName },
    phoneNumber: profile.phoneNumber,
    photoUrl: profile.photoKey === null ? null : OWN_PHOTO_URL,
    profileStatus: profile.profileStatus,
  };
}
