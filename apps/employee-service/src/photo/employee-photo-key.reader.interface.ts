export const EMPLOYEE_PHOTO_KEY_READER = Symbol('IEmployeePhotoKeyReader');

/** The account and the stored photo key of an employee who has a photo. The key is never sent to a client. */
export type EmployeePhotoKeyRecord = {
  readonly accountId: string;
  readonly photoKey: string;
};

/** Reads photo keys for a bounded list of accounts, so a page of thumbnails costs one query (D-57). */
export interface IEmployeePhotoKeyReader {
  /** Accounts without a profile or without a photo are absent from the result. */
  findPhotoKeysByAccountIds(accountIds: ReadonlyArray<string>): Promise<EmployeePhotoKeyRecord[]>;
}
