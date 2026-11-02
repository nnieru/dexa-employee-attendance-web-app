import type { WorkCalendarDatePage, WorkCalendarDateListQuery } from '@dexa/contracts';

export const WORK_CALENDAR_DATE_SERVICE = Symbol('IWorkCalendarDateService');

/** HR's list of company calendar exceptions. */
export interface IWorkCalendarDateService {
  /** The exceptions in the requested range, earliest date first, one page at a time. */
  listDates(query: WorkCalendarDateListQuery): Promise<WorkCalendarDatePage>;
}
