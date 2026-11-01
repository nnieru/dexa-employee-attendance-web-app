import type { OvertimeRequestPage, OwnRequestListQuery } from '@dexa/contracts';

export const OVERTIME_REQUEST_LIST_SERVICE = Symbol('IOvertimeRequestListService');

/** The signed-in account's own overtime requests, newest first (APR-6). Read only. */
export interface IOvertimeRequestListService {
  /** The account comes from the verified token, never from the query. */
  listOwnRequests(accountId: string, query: OwnRequestListQuery): Promise<OvertimeRequestPage>;
}
