import {
  INTERNAL_HTTP_CLIENT,
  ServiceName,
  type AuthenticatedUser,
  type IInternalHttpClient,
} from '@dexa/common';
import {
  API_PREFIX,
  correctionRequestPageSchema,
  correctionRequestReviewPageSchema,
  correctionRequestSchema,
  type ApproveCorrectionRequest,
  type CorrectionRequest,
  type CorrectionRequestPage,
  type CorrectionRequestReviewPage,
  type OwnRequestListQuery,
  type RejectCorrectionRequest,
  type RequestReviewQueueQuery,
  type SubmitCorrectionRequest,
} from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { ICorrectionRequestClient } from './correction-request-client.interface.js';
import {
  toRequestListQueryParameters,
  toRequestReviewQueueQueryParameters,
} from './request-list-query-parameters.js';

const CORRECTION_REQUESTS_PATH = `/${API_PREFIX}/attendance-corrections`;
const OWN_CORRECTION_REQUESTS_PATH = `${CORRECTION_REQUESTS_PATH}/me`;

function decisionPath(requestId: string, decision: 'approve' | 'reject'): string {
  return `${CORRECTION_REQUESTS_PATH}/${requestId}/${decision}`;
}

@Injectable()
export class CorrectionRequestClient implements ICorrectionRequestClient {
  constructor(@Inject(INTERNAL_HTTP_CLIENT) private readonly httpClient: IInternalHttpClient) {}

  // A submission is not retried by the gateway, as for every POST: a lost answer may hide a saved request. The client
  // resends the same idempotency key, and attendance-service answers the stored request with 200.
  submitCorrection(
    user: AuthenticatedUser,
    request: SubmitCorrectionRequest,
  ): Promise<CorrectionRequest> {
    return this.httpClient.post({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: CORRECTION_REQUESTS_PATH,
      body: request,
      onBehalfOf: user,
      responseSchema: correctionRequestSchema,
    });
  }

  // A read, so it is not retried by the gateway, as for the other reads. Each query parameter is forwarded as the caller
  // sent it, with the defaults filled by the gateway's schema.
  listOwnRequests(
    user: AuthenticatedUser,
    query: OwnRequestListQuery,
  ): Promise<CorrectionRequestPage> {
    return this.httpClient.get({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: OWN_CORRECTION_REQUESTS_PATH,
      query: toRequestListQueryParameters(query),
      onBehalfOf: user,
      responseSchema: correctionRequestPageSchema,
    });
  }

  // HR only: the gateway guard and attendance-service both check the role. A read, so it is not retried.
  listReviewQueue(
    user: AuthenticatedUser,
    query: RequestReviewQueueQuery,
  ): Promise<CorrectionRequestReviewPage> {
    return this.httpClient.get({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: CORRECTION_REQUESTS_PATH,
      query: toRequestReviewQueueQueryParameters(query),
      onBehalfOf: user,
      responseSchema: correctionRequestReviewPageSchema,
    });
  }

  // HR only. A decision is not retried by the gateway: a lost answer must not be replayed as a second decision. A replay
  // of the same decision is answered by attendance-service with the recorded request.
  approveCorrection(
    user: AuthenticatedUser,
    requestId: string,
    body: ApproveCorrectionRequest,
  ): Promise<CorrectionRequest> {
    return this.httpClient.post({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: decisionPath(requestId, 'approve'),
      body,
      onBehalfOf: user,
      responseSchema: correctionRequestSchema,
    });
  }

  rejectCorrection(
    user: AuthenticatedUser,
    requestId: string,
    body: RejectCorrectionRequest,
  ): Promise<CorrectionRequest> {
    return this.httpClient.post({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: decisionPath(requestId, 'reject'),
      body,
      onBehalfOf: user,
      responseSchema: correctionRequestSchema,
    });
  }
}
