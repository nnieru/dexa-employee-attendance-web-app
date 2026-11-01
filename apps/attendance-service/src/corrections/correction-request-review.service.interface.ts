import type { CorrectionRequestReviewPage, RequestReviewQueueQuery } from '@dexa/contracts';

export const CORRECTION_REQUEST_REVIEW_SERVICE = Symbol('ICorrectionRequestReviewService');

/** The HR review queue of correction requests (APR-1). Read only. */
export interface ICorrectionRequestReviewService {
  /** The reviewer comes from the verified token, never from the query. It sets isOwnRequest (APR-4). */
  listReviewQueue(
    reviewerAccountId: string,
    query: RequestReviewQueueQuery,
  ): Promise<CorrectionRequestReviewPage>;
}
