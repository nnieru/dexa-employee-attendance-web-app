import type { OvertimeRequestReviewPage, RequestReviewQueueQuery } from '@dexa/contracts';

export const OVERTIME_REQUEST_REVIEW_SERVICE = Symbol('IOvertimeRequestReviewService');

/** The HR review queue of overtime requests (APR-1). Read only. */
export interface IOvertimeRequestReviewService {
  /** The reviewer comes from the verified token, never from the query. It sets isOwnRequest (APR-4). */
  listReviewQueue(
    reviewerAccountId: string,
    query: RequestReviewQueueQuery,
  ): Promise<OvertimeRequestReviewPage>;
}
