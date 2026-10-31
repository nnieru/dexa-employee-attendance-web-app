import { INTERNAL_HTTP_CLIENT, ServiceName, type IInternalHttpClient } from '@dexa/common';
import {
  API_PREFIX,
  ErrorCode,
  workCalendarDatePageSchema,
  workCalendarDateSchema,
  type WorkCalendarDate,
  type WorkCalendarDatePage,
  type WorkCalendarDateListQuery,
  type WorkCalendarDateRequest,
} from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { IWorkCalendarDateClient } from './work-calendar-date-client.interface.js';

// The gateway forwards the caller's token, so a 401 from attendance-service means that token was refused. The gateway's
// own status check already ran before this call.
const USER_TOKEN_REFUSAL_CODES = [ErrorCode.UNAUTHORIZED, ErrorCode.ACCOUNT_DISABLED];
const WORK_CALENDAR_DATES_PATH = `/${API_PREFIX}/work-calendar-dates`;

@Injectable()
export class WorkCalendarDateClient implements IWorkCalendarDateClient {
  constructor(@Inject(INTERNAL_HTTP_CLIENT) private readonly httpClient: IInternalHttpClient) {}

  // HR only: the gateway guard and attendance-service both check the role. A read, so it is not retried.
  listDates(accessToken: string, query: WorkCalendarDateListQuery): Promise<WorkCalendarDatePage> {
    return this.httpClient.get({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: WORK_CALENDAR_DATES_PATH,
      query: toListQueryParameters(query),
      forwardedUserToken: accessToken,
      refusalCodes: USER_TOKEN_REFUSAL_CODES,
      responseSchema: workCalendarDatePageSchema,
    });
  }

  // A save is not retried: a PUT that was saved is the same exception on a second send, but a lost answer leaves HR
  // unsure what was stored, so HR decides whether to save again.
  upsertDate(
    accessToken: string,
    date: string,
    request: WorkCalendarDateRequest,
  ): Promise<WorkCalendarDate> {
    return this.httpClient.putJson({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: `${WORK_CALENDAR_DATES_PATH}/${encodeURIComponent(date)}`,
      body: request,
      forwardedUserToken: accessToken,
      refusalCodes: USER_TOKEN_REFUSAL_CODES,
      responseSchema: workCalendarDateSchema,
    });
  }

  // A delete is not retried: a lost answer may hide a removed exception, and a retry would only answer 404.
  deleteDate(accessToken: string, date: string): Promise<void> {
    return this.httpClient.delete({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: `${WORK_CALENDAR_DATES_PATH}/${encodeURIComponent(date)}`,
      forwardedUserToken: accessToken,
      refusalCodes: USER_TOKEN_REFUSAL_CODES,
      responseSchema: z.void(),
    });
  }
}

function toListQueryParameters(query: WorkCalendarDateListQuery): Record<string, string> {
  return {
    from: query.from,
    to: query.to,
    page: String(query.page),
    pageSize: String(query.pageSize),
  };
}
