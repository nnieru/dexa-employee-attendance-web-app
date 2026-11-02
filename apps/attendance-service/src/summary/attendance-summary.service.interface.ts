import type { AttendanceSummaryPage, AttendanceSummaryQuery } from '@dexa/contracts';

export const ATTENDANCE_SUMMARY_SERVICE = Symbol('IAttendanceSummaryService');

/** The signed-in employee's own attendance days over a date range. Read only. */
export interface IAttendanceSummaryService {
  /**
   * The account comes from the verified token. A missing from or to is filled from the clock: the first day of the
   * current business month and today. Rejects with a validation error when the resolved range is out of order.
   */
  listOwnSummary(accountId: string, query: AttendanceSummaryQuery): Promise<AttendanceSummaryPage>;
}
