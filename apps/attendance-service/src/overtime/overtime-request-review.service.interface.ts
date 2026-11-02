import type {
  OvertimeRequestReviewItem,
  OvertimeRequestReviewPage,
  RequestReviewQueueQuery,
} from '@dexa/contracts';

export const OVERTIME_REQUEST_REVIEW_SERVICE = Symbol('IOvertimeRequestReviewService');

/** The HR review queue and detail of overtime requests. Read only. */
export interface IOvertimeRequestReviewService {
  /** The reviewer comes from the verified token, never from the query. It sets isOwnRequest. */
  listReviewQueue(
    reviewerAccountId: string,
    query: RequestReviewQueueQuery,
  ): Promise<OvertimeRequestReviewPage>;
  /** One request for the review detail screen. An unknown ID is a REQUEST_NOT_FOUND error. */
  getReviewRequest(
    reviewerAccountId: string,
    requestId: string,
  ): Promise<OvertimeRequestReviewItem>;
}
