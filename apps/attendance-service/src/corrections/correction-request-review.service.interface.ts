import type {
  CorrectionRequestReviewItem,
  CorrectionRequestReviewPage,
  RequestReviewQueueQuery,
} from '@dexa/contracts';

export const CORRECTION_REQUEST_REVIEW_SERVICE = Symbol('ICorrectionRequestReviewService');

/** The HR review queue and detail of correction requests. Read only. */
export interface ICorrectionRequestReviewService {
  /** The reviewer comes from the verified token, never from the query. It sets isOwnRequest. */
  listReviewQueue(
    reviewerAccountId: string,
    query: RequestReviewQueueQuery,
  ): Promise<CorrectionRequestReviewPage>;
  /** One request for the review detail screen. An unknown ID is a REQUEST_NOT_FOUND error. */
  getReviewRequest(
    reviewerAccountId: string,
    requestId: string,
  ): Promise<CorrectionRequestReviewItem>;
}
