import type { ProfileField, UpdateOwnProfileRequest } from '@dexa/contracts';

export const OWN_PHONE_SERVICE = Symbol('IOwnPhoneService');

/** The fields that the committed change reported. Empty when the request left the stored phone as it was. */
export type OwnPhoneChangeSet = {
  readonly changedFields: ReadonlyArray<ProfileField>;
};

/** The signed-in employee's phone number (PRO-2). The account ID comes from the verified token. */
export interface IOwnPhoneService {
  /**
   * Resolves once the phone and the recomputed profile status have committed together, or immediately with an
   * empty change set when the phone was already stored. Rejects with NOT_FOUND when the account has no profile.
   */
  updatePhone(accountId: string, request: UpdateOwnProfileRequest): Promise<OwnPhoneChangeSet>;
}
