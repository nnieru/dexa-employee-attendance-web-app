import type { RequestReviewQueueCriteria } from '../requests/request-review-queue.criteria.js';
import type { StoredOvertimeRequest } from './overtime-request.repository.interface.js';

export const OVERTIME_REQUEST_REVIEW_READER = Symbol('IOvertimeRequestReviewReader');

/** A stored overtime request with the requester and the requester's approved minutes on the same business date. */
export type StoredOvertimeReviewRequest = StoredOvertimeRequest & {
  readonly requesterAccountId: string;
  /** Minutes of the requester's APPROVED overtime on the same business date (OT-4), this request included if approved. */
  readonly approvedMinutes: number;
};

export type StoredOvertimeReviewPage = {
  /** Oldest first: created_at ascending, then id ascending. */
  readonly records: ReadonlyArray<StoredOvertimeReviewRequest>;
  readonly totalItems: number;
};

/** Read-only access to the overtime review queue. Writes belong to IOvertimeRequestTransaction. */
export interface IOvertimeRequestReviewReader {
  findReviewPage(criteria: RequestReviewQueueCriteria): Promise<StoredOvertimeReviewPage>;
  findReviewRequestById(requestId: string): Promise<StoredOvertimeReviewRequest | undefined>;
}
