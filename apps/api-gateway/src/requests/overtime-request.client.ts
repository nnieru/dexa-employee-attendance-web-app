import {
  INTERNAL_HTTP_CLIENT,
  ServiceName,
  type AuthenticatedUser,
  type IInternalHttpClient,
} from '@dexa/common';
import {
  API_PREFIX,
  overtimeRequestSchema,
  type OvertimeRequest,
  type SubmitOvertimeRequest,
} from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { IOvertimeRequestClient } from './overtime-request-client.interface.js';

const OVERTIME_REQUESTS_PATH = `/${API_PREFIX}/overtime-requests`;

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
}
