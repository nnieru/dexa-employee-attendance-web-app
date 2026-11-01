import { sql, type SQL } from 'drizzle-orm';
import { attendanceAdjustmentRequests, attendanceDays } from '../infrastructure/db/schema.js';

// True when an approved correction has been applied to the day. applied_revision is set exactly when the request is
// APPROVED (DATABASE §5.8), so this is the same as an approved correction on the day. The outer query must read
// attendance_days. The (attendance_day_id, created_at) index serves the probe.
export function hasAppliedCorrectionOnDay(): SQL<boolean> {
  return sql<boolean>`exists (select 1 from ${attendanceAdjustmentRequests} where ${attendanceAdjustmentRequests.attendanceDayId} = ${attendanceDays.id} and ${attendanceAdjustmentRequests.appliedRevision} is not null)`;
}
