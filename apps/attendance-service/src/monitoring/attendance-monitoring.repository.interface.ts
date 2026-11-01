import type { AttendanceSummaryRecord } from '../summary/attendance-summary.repository.interface.js';
import type { AttendanceRange } from '../summary/attendance-range.rules.js';

export const ATTENDANCE_MONITORING_READER = Symbol('IAttendanceMonitoringReader');

/**
 * One stored day of one account, as the HR list shows it. The day fields are the same as the own summary's. The raw
 * punches are the original IN and OUT entries (DATABASE §5.5), null when there is none. isCorrected is true when an
 * approved correction has been applied to the day (DATABASE §5.8).
 */
export type AttendanceMonitoringRecord = AttendanceSummaryRecord & {
  readonly accountId: string;
  readonly rawClockInAt: Date | null;
  readonly rawClockOutAt: Date | null;
  readonly isCorrected: boolean;
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
