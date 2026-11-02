import { sql, type SQL } from 'drizzle-orm';
import { attendanceDays, overtimeRequests } from '../infrastructure/db/schema.js';
import { REQUEST_STATUS } from '../requests/request-decision.rules.js';

// The approved overtime minutes of each day in the outer query, as a correlated sum over the day's approved intervals
// Pending and rejected requests add nothing. The minutes keep their seconds and are not rounded, the
// same as the HR review queue. The (attendance_day_id, created_at) index serves the lookup, so a page costs one
// indexed probe per day and no extra query. The outer query must read attendance_days.
export function approvedOvertimeMinutesOfDay(): SQL<number> {
  return sql<number>`coalesce((select sum(extract(epoch from (${overtimeRequests.requestedEndAt} - ${overtimeRequests.requestedStartAt}))) / 60 from ${overtimeRequests} where ${overtimeRequests.attendanceDayId} = ${attendanceDays.id} and ${overtimeRequests.status} = ${REQUEST_STATUS.APPROVED}), 0)`.mapWith(
    Number,
  );
}
