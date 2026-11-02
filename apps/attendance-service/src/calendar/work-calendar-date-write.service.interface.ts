import type { BusinessDate } from '@dexa/common';
import type { WorkCalendarDate, WorkCalendarDateRequest } from '@dexa/contracts';

export const WORK_CALENDAR_DATE_WRITE_SERVICE = Symbol('IWorkCalendarDateWriteService');

/** HR's changes to the company calendar exceptions. Only dates after today can change. */
export interface IWorkCalendarDateWriteService {
  /** Stores the exception for a future date, replacing any earlier one. Stores it even when it matches the schedule. */
  upsertDate(date: BusinessDate, request: WorkCalendarDateRequest): Promise<WorkCalendarDate>;
  /** Removes the exception for a future date. Rejects with not found when the date has none. */
  deleteDate(date: BusinessDate): Promise<void>;
}
