import type { AuthenticatedUser } from '@dexa/common';
import type {
  CorrectionRequest,
  CorrectionRequestPage,
  CorrectionRequestReviewPage,
  OwnRequestListQuery,
  RequestReviewQueueQuery,
  SubmitCorrectionRequest,
} from '@dexa/contracts';

/** The gateway's calls into attendance-service for correction requests. The controller depends on this port, not on the transport. */
export interface ICorrectionRequestClient {
  submitCorrection(
    user: AuthenticatedUser,
    request: SubmitCorrectionRequest,
  ): Promise<CorrectionRequest>;
  listOwnRequests(
    user: AuthenticatedUser,
    query: OwnRequestListQuery,
  ): Promise<CorrectionRequestPage>;
  listReviewQueue(
    user: AuthenticatedUser,
    query: RequestReviewQueueQuery,
  ): Promise<CorrectionRequestReviewPage>;
}

export const CORRECTION_REQUEST_CLIENT = Symbol('ICorrectionRequestClient');
