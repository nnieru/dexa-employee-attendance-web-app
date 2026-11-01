import type { RequestStatus } from '@dexa/contracts';
import type { StoredOvertimeRequest } from './overtime-request.repository.interface.js';

export const OVERTIME_REQUEST_LIST_READER = Symbol('IOvertimeRequestListReader');

/** One page of one account's own overtime requests. Status absent means every status. */
export type OwnOvertimeRequestCriteria = {
  readonly accountId: string;
  readonly status?: RequestStatus;
  readonly page: number;
  readonly pageSize: number;
};

export type StoredOvertimeRequestPage = {
  /** Newest first: created_at descending, then id descending. */
  readonly records: ReadonlyArray<StoredOvertimeRequest>;
  readonly totalItems: number;
};

/** Read-only access to one account's overtime requests. Writes belong to IOvertimeRequestTransaction. */
export interface IOvertimeRequestListReader {
  findOwnRequestPage(criteria: OwnOvertimeRequestCriteria): Promise<StoredOvertimeRequestPage>;
}
