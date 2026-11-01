import type { AttendanceDayStatus } from '@dexa/contracts';
import type { RequestReviewQueueCriteria } from '../requests/request-review-queue.criteria.js';
import type { StoredCorrectionRequest } from './correction-request.repository.interface.js';

export const CORRECTION_REQUEST_REVIEW_READER = Symbol('ICorrectionRequestReviewReader');

/**
 * A stored correction request with the requester and the day as it stands now (APR-1). The current times are the
 * effective times, which an approved correction or a punch changes (DATABASE §5.4).
 */
export type StoredCorrectionReviewRequest = StoredCorrectionRequest & {
  readonly requesterAccountId: string;
  readonly currentCheckinAt: Date | null;
  readonly currentCheckoutAt: Date | null;
  readonly currentDayStatus: AttendanceDayStatus;
};

export type StoredCorrectionReviewPage = {
  /** Oldest first: created_at ascending, then id ascending. */
  readonly records: ReadonlyArray<StoredCorrectionReviewRequest>;
  readonly totalItems: number;
};

/** Read-only access to the correction review queue. Writes belong to ICorrectionRequestTransaction. */
export interface ICorrectionRequestReviewReader {
  findReviewPage(criteria: RequestReviewQueueCriteria): Promise<StoredCorrectionReviewPage>;
}
