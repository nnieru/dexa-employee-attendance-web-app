import type { BusinessDate } from '@dexa/common';

export const ATTENDANCE_SUMMARY_READER = Symbol('IAttendanceSummaryReader');

/**
 * One stored day as the summary shows it. The times and status codes are the effective ones after any approved
 * correction (DATABASE §5.4). The status codes are the master codes as stored. A null check-in time is returned as
 * stored, and the rules decide what that means for the row.
 */
export type AttendanceSummaryRecord = {
  readonly businessDate: BusinessDate;
  readonly effectiveCheckinAt: Date | null;
  readonly checkinStatusCode: string;
  readonly effectiveCheckoutAt: Date | null;
  readonly checkoutStatusCode: string;
};

export type AttendanceSummaryCriteria = {
  readonly accountId: string;
  /** Both ends are inclusive business dates. */
  readonly from: BusinessDate;
  readonly to: BusinessDate;
  readonly page: number;
  readonly pageSize: number;
};

export type AttendanceSummaryRecordPage = {
  /** Newest business date first. */
  readonly records: ReadonlyArray<AttendanceSummaryRecord>;
  readonly totalItems: number;
};

/**
 * Read-only access to one account's attendance days. Writes belong to the punch transaction port, and this port takes
 * no row lock, so a summary never waits on a punch in progress (AGENTS §9).
 */
export interface IAttendanceSummaryReader {
  findDayPage(criteria: AttendanceSummaryCriteria): Promise<AttendanceSummaryRecordPage>;
}
