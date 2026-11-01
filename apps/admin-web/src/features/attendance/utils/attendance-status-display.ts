import type { AttendanceDayStatus, AttendanceMonitoringItem } from '@dexa/contracts';
import type { StatusLabelProps } from '@dexa/ui';

export type AttendanceStatusDisplay = {
  text: string;
  tone: NonNullable<StatusLabelProps['tone']>;
};

type ClockInStatus = AttendanceMonitoringItem['clockInStatus'];
type ClockOutStatus = AttendanceMonitoringItem['clockOutStatus'];

// DESIGN §8 labels. The same timing word has a different treatment at check-in and at check-out, so the two maps are
// separate. This copy repeats the employee summary's map on purpose: features do not import from each other
// (AGENTS §10). It is a candidate for a shared home once a second app needs it.
// PENDING_CHECKIN is a day a request created with no punch yet, labelled like the check-out it pairs with (D-59).
const CHECK_IN_STATUS_DISPLAY: Readonly<Record<ClockInStatus, AttendanceStatusDisplay>> = {
  EARLY_CHECKIN: { text: 'Early clock-in', tone: 'neutral' },
  ON_TIME_CHECKIN: { text: 'On-time clock-in', tone: 'success' },
  LATE_CHECKIN: { text: 'Late clock-in', tone: 'warning' },
  CHECKIN_NOT_REQUIRED: { text: 'Not required', tone: 'neutral' },
  PENDING_CHECKIN: { text: 'Not recorded yet', tone: 'neutral' },
};

const CHECK_OUT_STATUS_DISPLAY: Readonly<Record<ClockOutStatus, AttendanceStatusDisplay>> = {
  EARLY_CHECKOUT: { text: 'Early clock-out', tone: 'warning' },
  ON_TIME_CHECKOUT: { text: 'On-time clock-out', tone: 'success' },
  LATE_CHECKOUT: { text: 'Late clock-out', tone: 'neutral' },
  CHECKOUT_NOT_REQUIRED: { text: 'Not required', tone: 'neutral' },
  PENDING_CHECKOUT: { text: 'Not recorded yet', tone: 'neutral' },
};

export function getCheckInStatusDisplay(status: ClockInStatus): AttendanceStatusDisplay {
  return CHECK_IN_STATUS_DISPLAY[status];
}

export function getCheckOutStatusDisplay(status: ClockOutStatus): AttendanceStatusDisplay {
  return CHECK_OUT_STATUS_DISPLAY[status];
}

// The DAY status is the stored attendance state (PRD ADM-4, SUM-6), separate from the two timing classifications.
const DAY_STATUS_DISPLAY: Readonly<Record<AttendanceDayStatus, AttendanceStatusDisplay>> = {
  PENDING: { text: 'Pending', tone: 'neutral' },
  PRESENT: { text: 'Present', tone: 'success' },
  NOT_ATTEND: { text: 'Not attended', tone: 'error' },
  SICK_LEAVE: { text: 'Sick leave', tone: 'info' },
  LEAVE: { text: 'Leave', tone: 'info' },
  DAY_OFF: { text: 'Day off', tone: 'neutral' },
};

export function getDayStatusDisplay(status: AttendanceDayStatus): AttendanceStatusDisplay {
  return DAY_STATUS_DISPLAY[status];
}
