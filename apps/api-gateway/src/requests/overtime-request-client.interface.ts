import type { AuthenticatedUser } from '@dexa/common';
import type {
  ApproveOvertimeRequest,
  OvertimeRequest,
  OvertimeRequestPage,
  OvertimeRequestReviewPage,
  OwnRequestListQuery,
  RejectOvertimeRequest,
  RequestReviewQueueQuery,
  SubmitOvertimeRequest,
} from '@dexa/contracts';

/** The gateway's calls into attendance-service for overtime requests. The controller depends on this port, not on the transport. */
export interface IOvertimeRequestClient {
  submitOvertime(user: AuthenticatedUser, request: SubmitOvertimeRequest): Promise<OvertimeRequest>;
  listOwnRequests(
    user: AuthenticatedUser,
    query: OwnRequestListQuery,
  ): Promise<OvertimeRequestPage>;
  listReviewQueue(
    user: AuthenticatedUser,
    query: RequestReviewQueueQuery,
  ): Promise<OvertimeRequestReviewPage>;
  approveOvertime(
    user: AuthenticatedUser,
    requestId: string,
    body: ApproveOvertimeRequest,
  ): Promise<OvertimeRequest>;
  rejectOvertime(
    user: AuthenticatedUser,
    requestId: string,
    body: RejectOvertimeRequest,
  ): Promise<OvertimeRequest>;
}

export const OVERTIME_REQUEST_CLIENT = Symbol('IOvertimeRequestClient');
