import type { AuthenticatedUser } from '@dexa/common';
import type {
  WorkCalendarDate,
  WorkCalendarDatePage,
  WorkCalendarDateListQuery,
  WorkCalendarDateRequest,
} from '@dexa/contracts';

/** The gateway's calls into attendance-service for the company calendar exceptions. Controllers depend on this port. */
export interface IWorkCalendarDateClient {
  listDates(
    user: AuthenticatedUser,
    query: WorkCalendarDateListQuery,
  ): Promise<WorkCalendarDatePage>;
  upsertDate(
    user: AuthenticatedUser,
    date: string,
    request: WorkCalendarDateRequest,
  ): Promise<WorkCalendarDate>;
  deleteDate(user: AuthenticatedUser, date: string): Promise<void>;
}

export const WORK_CALENDAR_DATE_CLIENT = Symbol('IWorkCalendarDateClient');
