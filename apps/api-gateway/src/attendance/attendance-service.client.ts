import { INTERNAL_HTTP_CLIENT, ServiceName, type IInternalHttpClient } from '@dexa/common';
import {
  API_PREFIX,
  clockInResponseSchema,
  ErrorCode,
  type ClockInResponse,
} from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { IAttendanceServiceClient } from './attendance-service-client.interface.js';

// The gateway forwards the caller's token, so a 401 from attendance-service means that token was refused. The gateway's
// own status check already ran before this call.
const USER_TOKEN_REFUSAL_CODES = [ErrorCode.UNAUTHORIZED, ErrorCode.ACCOUNT_DISABLED];
const CLOCK_IN_PATH = `/${API_PREFIX}/attendance/clock-in`;

@Injectable()
export class AttendanceServiceClient implements IAttendanceServiceClient {
  constructor(@Inject(INTERNAL_HTTP_CLIENT) private readonly httpClient: IInternalHttpClient) {}

  // A punch is never retried by the gateway: a lost answer may hide a punch that was saved, and a retry would only
  // answer 409 ATTENDANCE_ALREADY_CLOCKED_IN for it. The empty body is sent as an empty object.
  clockIn(accessToken: string): Promise<ClockInResponse> {
    return this.httpClient.post({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: CLOCK_IN_PATH,
      body: {},
      forwardedUserToken: accessToken,
      refusalCodes: USER_TOKEN_REFUSAL_CODES,
      responseSchema: clockInResponseSchema,
    });
  }
}
