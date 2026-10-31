import { INTERNAL_HTTP_CLIENT, ServiceName, type IInternalHttpClient } from '@dexa/common';
import {
  API_PREFIX,
  attendanceSummaryPageSchema,
  clockInResponseSchema,
  clockOutResponseSchema,
  ErrorCode,
  todayAttendanceResponseSchema,
  type AttendanceSummaryPage,
  type AttendanceSummaryQuery,
  type ClockInResponse,
  type ClockOutResponse,
  type TodayAttendanceResponse,
} from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { IAttendanceServiceClient } from './attendance-service-client.interface.js';

// The gateway forwards the caller's token, so a 401 from attendance-service means that token was refused. The gateway's
// own status check already ran before this call.
const USER_TOKEN_REFUSAL_CODES = [ErrorCode.UNAUTHORIZED, ErrorCode.ACCOUNT_DISABLED];
const CLOCK_IN_PATH = `/${API_PREFIX}/attendance/clock-in`;
const CLOCK_OUT_PATH = `/${API_PREFIX}/attendance/clock-out`;
const TODAY_PATH = `/${API_PREFIX}/attendance/me/today`;
const SUMMARY_PATH = `/${API_PREFIX}/attendance/me`;

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

  // Same rule as clockIn: no retry, because a retry of a saved check-out only answers 409 ATTENDANCE_ALREADY_CLOCKED_OUT.
  clockOut(accessToken: string): Promise<ClockOutResponse> {
    return this.httpClient.post({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: CLOCK_OUT_PATH,
      body: {},
      forwardedUserToken: accessToken,
      refusalCodes: USER_TOKEN_REFUSAL_CODES,
      responseSchema: clockOutResponseSchema,
    });
  }

  // A read, so it may be retried, but the gateway does not retry: one forwarded call answers the employee's screen.
  getToday(accessToken: string): Promise<TodayAttendanceResponse> {
    return this.httpClient.get({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: TODAY_PATH,
      forwardedUserToken: accessToken,
      refusalCodes: USER_TOKEN_REFUSAL_CODES,
      responseSchema: todayAttendanceResponseSchema,
    });
  }

  // A read, so it is not retried by the gateway, as for today. Each query parameter is forwarded as the caller sent it.
  listOwnSummary(
    accessToken: string,
    query: AttendanceSummaryQuery,
  ): Promise<AttendanceSummaryPage> {
    return this.httpClient.get({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: SUMMARY_PATH,
      query: toSummaryQueryParameters(query),
      forwardedUserToken: accessToken,
      refusalCodes: USER_TOKEN_REFUSAL_CODES,
      responseSchema: attendanceSummaryPageSchema,
    });
  }
}

// An absent range bound is omitted, not sent empty, so attendance-service fills it from its own clock.
function toSummaryQueryParameters(query: AttendanceSummaryQuery): Record<string, string> {
  const parameters: Record<string, string> = {
    page: String(query.page),
    pageSize: String(query.pageSize),
  };
  if (query.from !== undefined) parameters.from = query.from;
  if (query.to !== undefined) parameters.to = query.to;
  return parameters;
}
