import type { RequestStatus } from '@dexa/contracts';
import type { StoredCorrectionRequest } from './correction-request.repository.interface.js';

export const CORRECTION_REQUEST_LIST_READER = Symbol('ICorrectionRequestListReader');

/** One page of one account's own corrections. Status absent means every status. */
export type OwnCorrectionRequestCriteria = {
  readonly accountId: string;
  readonly status?: RequestStatus;
  readonly page: number;
  readonly pageSize: number;
};

export type StoredCorrectionRequestPage = {
  /** Newest first: created_at descending, then id descending. */
  readonly records: ReadonlyArray<StoredCorrectionRequest>;
  readonly totalItems: number;
};

/** Read-only access to one account's correction requests. Writes belong to ICorrectionRequestTransaction. */
export interface ICorrectionRequestListReader {
  findOwnRequestPage(criteria: OwnCorrectionRequestCriteria): Promise<StoredCorrectionRequestPage>;
}
