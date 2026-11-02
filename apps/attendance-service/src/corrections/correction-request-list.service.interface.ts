import type { CorrectionRequestPage, OwnRequestListQuery } from '@dexa/contracts';

export const CORRECTION_REQUEST_LIST_SERVICE = Symbol('ICorrectionRequestListService');

/** The signed-in account's own correction requests, newest first. Read only. */
export interface ICorrectionRequestListService {
  /** The account comes from the verified token, never from the query. */
  listOwnRequests(accountId: string, query: OwnRequestListQuery): Promise<CorrectionRequestPage>;
}
