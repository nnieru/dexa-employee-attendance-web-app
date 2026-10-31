import type { AuthenticatedUser } from '@dexa/common';
import type {
  AttendanceMonitoringPage,
  AttendanceMonitoringQuery,
  AttendanceSummaryPage,
  AttendanceSummaryQuery,
  ClockInResponse,
  ClockOutResponse,
  TodayAttendanceResponse,
} from '@dexa/contracts';

/** The gateway's calls into attendance-service. Controllers depend on this port, not on the transport. */
export interface IAttendanceServiceClient {
  clockIn(user: AuthenticatedUser): Promise<ClockInResponse>;
  clockOut(user: AuthenticatedUser): Promise<ClockOutResponse>;
  getToday(user: AuthenticatedUser): Promise<TodayAttendanceResponse>;
  listOwnSummary(
    user: AuthenticatedUser,
    query: AttendanceSummaryQuery,
  ): Promise<AttendanceSummaryPage>;
  listAttendance(
    user: AuthenticatedUser,
    query: AttendanceMonitoringQuery,
  ): Promise<AttendanceMonitoringPage>;
}

export const ATTENDANCE_SERVICE_CLIENT = Symbol('IAttendanceServiceClient');
