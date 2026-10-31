import {
  INTERNAL_HTTP_CLIENT,
  ServiceName,
  type AuthenticatedUser,
  type IInternalHttpClient,
} from '@dexa/common';
import {
  API_PREFIX,
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

const WORK_CALENDAR_DATES_PATH = `/${API_PREFIX}/work-calendar-dates`;

@Injectable()
export class WorkCalendarDateClient implements IWorkCalendarDateClient {
  constructor(@Inject(INTERNAL_HTTP_CLIENT) private readonly httpClient: IInternalHttpClient) {}

  // HR only: the gateway guard and attendance-service both check the role. A read, so it is not retried.
  listDates(
    user: AuthenticatedUser,
    query: WorkCalendarDateListQuery,
  ): Promise<WorkCalendarDatePage> {
    return this.httpClient.get({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: WORK_CALENDAR_DATES_PATH,
      query: toListQueryParameters(query),
      onBehalfOf: user,
      responseSchema: workCalendarDatePageSchema,
    });
  }

  // A save is not retried: a PUT that was saved is the same exception on a second send, but a lost answer leaves HR
  // unsure what was stored, so HR decides whether to save again.
  upsertDate(
    user: AuthenticatedUser,
    date: string,
    request: WorkCalendarDateRequest,
  ): Promise<WorkCalendarDate> {
    return this.httpClient.putJson({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: `${WORK_CALENDAR_DATES_PATH}/${encodeURIComponent(date)}`,
      body: request,
      onBehalfOf: user,
      responseSchema: workCalendarDateSchema,
    });
  }

  // A delete is not retried: a lost answer may hide a removed exception, and a retry would only answer 404.
  deleteDate(user: AuthenticatedUser, date: string): Promise<void> {
    return this.httpClient.delete({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: `${WORK_CALENDAR_DATES_PATH}/${encodeURIComponent(date)}`,
      onBehalfOf: user,
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
