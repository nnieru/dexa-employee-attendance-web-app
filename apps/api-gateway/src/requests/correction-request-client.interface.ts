import type { AuthenticatedUser } from '@dexa/common';
import type {
  ApproveCorrectionRequest,
  CorrectionRequest,
  CorrectionRequestPage,
  CorrectionRequestReviewPage,
  OwnRequestListQuery,
  RejectCorrectionRequest,
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
  approveCorrection(
    user: AuthenticatedUser,
    requestId: string,
    body: ApproveCorrectionRequest,
  ): Promise<CorrectionRequest>;
  rejectCorrection(
    user: AuthenticatedUser,
    requestId: string,
    body: RejectCorrectionRequest,
  ): Promise<CorrectionRequest>;
}

export const CORRECTION_REQUEST_CLIENT = Symbol('ICorrectionRequestClient');
