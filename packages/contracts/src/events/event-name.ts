// Event types published on the events exchange. The value is the routing key, so it is also the wire name.
// Add a name here only together with its payload schema and the ARCHITECTURE §8 row that describes it.
export const EventName = {
  EMPLOYEE_PROFILE_UPDATED: 'employee.profile.updated',
  ACCOUNT_PASSWORD_CHANGED: 'account.password.changed',
  ATTENDANCE_REQUEST_SUBMITTED: 'attendance.request.submitted',
  ATTENDANCE_REQUEST_APPROVED: 'attendance.request.approved',
  ATTENDANCE_REQUEST_REJECTED: 'attendance.request.rejected',
} as const;

export type EventName = (typeof EventName)[keyof typeof EventName];
