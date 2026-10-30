import type { Readable } from 'node:stream';
import type { ProfileField } from '@dexa/contracts';

export const OWN_PHOTO_SERVICE = Symbol('IOwnPhotoService');

/** The fields that the committed photo change reported. */
export type OwnPhotoChangeSet = {
  readonly changedFields: ReadonlyArray<ProfileField>;
};

/** The signed-in employee's photo (PRO-2). The account ID comes from the verified token, never from the request. */
export interface IOwnPhotoService {
  /**
   * Resolves once the photo file is durable and its reference and the recomputed status have committed. Rejects
   * with NOT_FOUND, leaving no file behind, when the account has no profile.
   */
  replacePhoto(accountId: string, upload: Buffer): Promise<OwnPhotoChangeSet>;
  /** Resolves to the stored photo of the account. Rejects with NOT_FOUND when there is no photo to serve. */
  getOwnPhoto(accountId: string): Promise<Readable>;
}
