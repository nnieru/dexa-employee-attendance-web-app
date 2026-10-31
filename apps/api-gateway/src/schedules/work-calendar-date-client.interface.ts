import type {
  WorkCalendarDate,
  WorkCalendarDatePage,
  WorkCalendarDateListQuery,
  WorkCalendarDateRequest,
} from '@dexa/contracts';

/** The gateway's calls into attendance-service for the company calendar exceptions. Controllers depend on this port. */
export interface IWorkCalendarDateClient {
  listDates(accessToken: string, query: WorkCalendarDateListQuery): Promise<WorkCalendarDatePage>;
  upsertDate(
    accessToken: string,
    date: string,
    request: WorkCalendarDateRequest,
  ): Promise<WorkCalendarDate>;
  deleteDate(accessToken: string, date: string): Promise<void>;
}

export const WORK_CALENDAR_DATE_CLIENT = Symbol('IWorkCalendarDateClient');
