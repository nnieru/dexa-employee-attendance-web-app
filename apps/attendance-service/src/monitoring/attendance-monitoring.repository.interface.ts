import type { AttendanceSummaryRecord } from '../summary/attendance-summary.repository.interface.js';
import type { AttendanceRange } from '../summary/attendance-range.rules.js';

export const ATTENDANCE_MONITORING_READER = Symbol('IAttendanceMonitoringReader');

/** One stored day of one account, as the HR list shows it. The day fields are the same as the own summary's. */
export type AttendanceMonitoringRecord = AttendanceSummaryRecord & {
  readonly accountId: string;
};

export type AttendanceMonitoringCriteria = AttendanceRange & {
  /** Only this account's days when set; every account's days when undefined. */
  readonly accountId: string | undefined;
  readonly page: number;
  readonly pageSize: number;
};

export type AttendanceMonitoringRecordPage = {
  /** Newest business date first, then by account ID, so a page boundary is stable. */
  readonly records: ReadonlyArray<AttendanceMonitoringRecord>;
  readonly totalItems: number;
};

/**
 * Read-only access to every account's attendance days. Like the summary reader it takes no row lock, so the list
 * never waits on a punch in progress.
 */
export interface IAttendanceMonitoringReader {
  findDayPage(criteria: AttendanceMonitoringCriteria): Promise<AttendanceMonitoringRecordPage>;
}
