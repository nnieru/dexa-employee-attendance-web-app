import type { OwnProfile } from '@dexa/contracts';

export const OWN_PROFILE_SERVICE = Symbol('IOwnProfileService');

/** The signed-in employee's profile. The account ID comes from the verified token, never from the request. */
export interface IOwnProfileService {
  getOwnProfile(accountId: string): Promise<OwnProfile>;
}
