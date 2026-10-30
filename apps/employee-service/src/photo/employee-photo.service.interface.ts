import type { Readable } from 'node:stream';

export const EMPLOYEE_PHOTO_SERVICE = Symbol('IEmployeePhotoService');

/** Another employee's photo, served to HR (ADM-3). The caller's role is checked before this port is reached. */
export interface IEmployeePhotoService {
  /** Resolves to the stored photo of the account. Rejects with NOT_FOUND when there is no photo to serve. */
  getEmployeePhoto(accountId: string): Promise<Readable>;
}
