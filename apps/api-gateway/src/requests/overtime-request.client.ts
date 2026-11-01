import {
  INTERNAL_HTTP_CLIENT,
  ServiceName,
  type AuthenticatedUser,
  type IInternalHttpClient,
} from '@dexa/common';
import {
  API_PREFIX,
  overtimeRequestPageSchema,
  overtimeRequestReviewItemSchema,
  overtimeRequestReviewPageSchema,
  overtimeRequestSchema,
  type ApproveOvertimeRequest,
  type OvertimeRequest,
  type OvertimeRequestPage,
  type OvertimeRequestReviewItem,
  type OvertimeRequestReviewPage,
  type OwnRequestListQuery,
  type RejectOvertimeRequest,
  type RequestReviewQueueQuery,
  type SubmitOvertimeRequest,
} from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { IOvertimeRequestClient } from './overtime-request-client.interface.js';
import {
  toRequestListQueryParameters,
  toRequestReviewQueueQueryParameters,
} from './request-list-query-parameters.js';

const OVERTIME_REQUESTS_PATH = `/${API_PREFIX}/overtime-requests`;
const OWN_OVERTIME_REQUESTS_PATH = `${OVERTIME_REQUESTS_PATH}/me`;

function decisionPath(requestId: string, decision: 'approve' | 'reject'): string {
  return `${OVERTIME_REQUESTS_PATH}/${requestId}/${decision}`;
}

@Injectable()
export class OvertimeRequestClient implements IOvertimeRequestClient {
  constructor(@Inject(INTERNAL_HTTP_CLIENT) private readonly httpClient: IInternalHttpClient) {}

  // A submission is not retried by the gateway, as for every POST: a lost answer may hide a saved request. The client
  // resends the same idempotency key, and attendance-service answers the stored request with 200.
  submitOvertime(
    user: AuthenticatedUser,
    request: SubmitOvertimeRequest,
  ): Promise<OvertimeRequest> {
    return this.httpClient.post({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: OVERTIME_REQUESTS_PATH,
      body: request,
      onBehalfOf: user,
      responseSchema: overtimeRequestSchema,
    });
  }

  // A read, so it is not retried by the gateway, as for the other reads. Each query parameter is forwarded as the caller
  // sent it, with the defaults filled by the gateway's schema.
  listOwnRequests(
    user: AuthenticatedUser,
    query: OwnRequestListQuery,
  ): Promise<OvertimeRequestPage> {
    return this.httpClient.get({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: OWN_OVERTIME_REQUESTS_PATH,
      query: toRequestListQueryParameters(query),
      onBehalfOf: user,
      responseSchema: overtimeRequestPageSchema,
    });
  }

  // HR only: the gateway guard and attendance-service both check the role. A read, so it is not retried.
  listReviewQueue(
    user: AuthenticatedUser,
    query: RequestReviewQueueQuery,
  ): Promise<OvertimeRequestReviewPage> {
    return this.httpClient.get({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: OVERTIME_REQUESTS_PATH,
      query: toRequestReviewQueueQueryParameters(query),
      onBehalfOf: user,
      responseSchema: overtimeRequestReviewPageSchema,
    });
  }

  // HR only: the gateway guard and attendance-service both check the role. A read, so it is not retried.
  getReviewRequest(user: AuthenticatedUser, requestId: string): Promise<OvertimeRequestReviewItem> {
    return this.httpClient.get({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: `${OVERTIME_REQUESTS_PATH}/${requestId}`,
      onBehalfOf: user,
      responseSchema: overtimeRequestReviewItemSchema,
    });
  }

  // HR only. A decision is not retried by the gateway: a lost answer must not be replayed as a second decision. A replay
  // of the same decision is answered by attendance-service with the recorded request.
  approveOvertime(
    user: AuthenticatedUser,
    requestId: string,
    body: ApproveOvertimeRequest,
  ): Promise<OvertimeRequest> {
    return this.httpClient.post({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: decisionPath(requestId, 'approve'),
      body,
      onBehalfOf: user,
      responseSchema: overtimeRequestSchema,
    });
  }

  rejectOvertime(
    user: AuthenticatedUser,
    requestId: string,
    body: RejectOvertimeRequest,
  ): Promise<OvertimeRequest> {
    return this.httpClient.post({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: decisionPath(requestId, 'reject'),
      body,
      onBehalfOf: user,
      responseSchema: overtimeRequestSchema,
    });
  }
}
