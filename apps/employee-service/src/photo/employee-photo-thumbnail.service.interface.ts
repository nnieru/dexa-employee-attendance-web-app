import type { PhotoThumbnailItem } from '@dexa/contracts';

export const EMPLOYEE_PHOTO_THUMBNAIL_SERVICE = Symbol('IEmployeePhotoThumbnailService');

/** HR's batched employee photo thumbnails for the employee list (D-57). The caller's role is checked before this port. */
export interface IEmployeePhotoThumbnailService {
  /**
   * Resolves to one thumbnail per listed account that has a readable photo, in the order of the request. Accounts
   * without one are absent. One bad photo never fails the whole batch.
   */
  getThumbnails(accountIds: ReadonlyArray<string>): Promise<PhotoThumbnailItem[]>;
}
