import {
  INTERNAL_HTTP_CLIENT,
  ServiceName,
  type AuthenticatedUser,
  type IInternalHttpClient,
} from '@dexa/common';
import {
  API_PREFIX,
  correctionRequestSchema,
  type CorrectionRequest,
  type SubmitCorrectionRequest,
} from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { ICorrectionRequestClient } from './correction-request-client.interface.js';

const CORRECTION_REQUESTS_PATH = `/${API_PREFIX}/attendance-corrections`;

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
}
