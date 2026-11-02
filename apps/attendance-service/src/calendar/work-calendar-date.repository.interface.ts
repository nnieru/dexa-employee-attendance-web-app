import type { BusinessDate } from '@dexa/common';
import type { WorkCalendarDate } from '@dexa/contracts';

export const WORK_CALENDAR_DATE_READER = Symbol('IWorkCalendarDateReader');
export const WORK_CALENDAR_DATE_WRITER = Symbol('IWorkCalendarDateWriter');

export type WorkCalendarDateCriteria = {
  readonly from: BusinessDate;
  readonly to: BusinessDate;
  readonly page: number;
  readonly pageSize: number;
};

export type WorkCalendarDateRecordPage = {
  /** Earliest business date first, so a page boundary is stable. */
  readonly dates: ReadonlyArray<WorkCalendarDate>;
  readonly totalItems: number;
};

/** The values of one exception. The service builds them; the repository stores them. A null description is stored as null. */
export type NewWorkCalendarDate = {
  readonly date: BusinessDate;
  readonly isWorkingDay: boolean;
  readonly description: string | null;
};

/** Read access to the calendar exceptions that HR lists. */
export interface IWorkCalendarDateReader {
  findDatePage(criteria: WorkCalendarDateCriteria): Promise<WorkCalendarDateRecordPage>;
}

/** Write access to the calendar exceptions. The service decides what may change; the repository only stores it. */
export interface IWorkCalendarDateWriter {
  /** Stores the exception for the date, replacing any earlier one for it. Returns the stored exception. */
  upsertDate(values: NewWorkCalendarDate): Promise<WorkCalendarDate>;
  /** Removes the exception for the date. Resolves false when the date had none. */
  deleteDate(date: BusinessDate): Promise<boolean>;
}
