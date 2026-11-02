import type { AttendanceMonitoringPage, AttendanceMonitoringQuery } from '@dexa/contracts';

export const ATTENDANCE_MONITORING_SERVICE = Symbol('IAttendanceMonitoringService');

/** Every account's attendance days for HR. Read only: there is no write use case. */
export interface IAttendanceMonitoringService {
  /**
   * A missing from or to is filled from the clock as for the own summary. Rejects with a validation error when the
   * resolved range is out of order, and with a dependency error when Employee cannot resolve the page's names.
   */
  listAttendance(query: AttendanceMonitoringQuery): Promise<AttendanceMonitoringPage>;
}
