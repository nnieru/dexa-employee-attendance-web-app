import type { BusinessDate } from '@dexa/common';
import type { RequestStatus } from '@dexa/contracts';

/**
 * One page of the HR review queue (APR-1), shared by overtime and correction requests. An absent filter applies no
 * filter. The page is ordered oldest first (created_at ascending, then id ascending) for every status.
 */
export type RequestReviewQueueCriteria = {
  readonly status: RequestStatus;
  /** Only this requester's requests when set. */
  readonly requesterAccountId: string | undefined;
  /** Both ends are inclusive business dates of the request's day. */
  readonly from: BusinessDate | undefined;
  readonly to: BusinessDate | undefined;
  readonly page: number;
  readonly pageSize: number;
};
