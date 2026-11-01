import type { AttendanceDayStatus, AttendanceSummaryItem } from '@dexa/contracts';
import type { StatusLabelProps } from '@dexa/ui';

export type SummaryStatusDisplay = {
  text: string;
  tone: NonNullable<StatusLabelProps['tone']>;
};

type ClockInStatus = AttendanceSummaryItem['clockInStatus'];
type ClockOutStatus = AttendanceSummaryItem['clockOutStatus'];

// DESIGN §8 day outcome labels, with PENDING named "Pending" as the owner asked for this screen (DESIGN §8 proposes
// "Awaiting record"). NOT_ATTEND is named "Absent" (DESIGN section 8). The text carries the meaning, so a tone
// is never the only signal (DESIGN §8).
const DAY_STATUS_DISPLAY: Readonly<Record<AttendanceDayStatus, SummaryStatusDisplay>> = {
  PENDING: { text: 'Pending', tone: 'neutral' },
  PRESENT: { text: 'Present', tone: 'success' },
  NOT_ATTEND: { text: 'Absent', tone: 'error' },
  SICK_LEAVE: { text: 'Sick leave', tone: 'info' },
  LEAVE: { text: 'Leave', tone: 'info' },
  DAY_OFF: { text: 'Day off', tone: 'neutral' },
};

// DESIGN §8 labels. The same timing word has a different treatment at check-in and at check-out, so the two maps are
// separate. This copy repeats the attendance feature's map on purpose: features do not import from each other
// (AGENTS §10). It is a candidate for a shared home once a third screen needs it.
// PENDING_CHECKIN is a day a request created with no punch yet, labelled like the check-out it pairs with (D-59).
// CHECKIN_NOT_REQUIRED and CHECKOUT_NOT_REQUIRED are what a SICK_LEAVE or LEAVE day stores (correction-apply rules).
const CHECK_IN_STATUS_DISPLAY: Readonly<Record<ClockInStatus, SummaryStatusDisplay>> = {
  EARLY_CHECKIN: { text: 'Early clock-in', tone: 'neutral' },
  ON_TIME_CHECKIN: { text: 'On-time clock-in', tone: 'success' },
  LATE_CHECKIN: { text: 'Late clock-in', tone: 'warning' },
  CHECKIN_NOT_REQUIRED: { text: 'Not required', tone: 'neutral' },
  PENDING_CHECKIN: { text: 'Not recorded yet', tone: 'neutral' },
};

const CHECK_OUT_STATUS_DISPLAY: Readonly<Record<ClockOutStatus, SummaryStatusDisplay>> = {
  EARLY_CHECKOUT: { text: 'Early clock-out', tone: 'warning' },
  ON_TIME_CHECKOUT: { text: 'On-time clock-out', tone: 'success' },
  LATE_CHECKOUT: { text: 'Late clock-out', tone: 'neutral' },
  CHECKOUT_NOT_REQUIRED: { text: 'Not required', tone: 'neutral' },
  PENDING_CHECKOUT: { text: 'Not recorded yet', tone: 'neutral' },
};

export function getSummaryDayStatusDisplay(status: AttendanceDayStatus): SummaryStatusDisplay {
  return DAY_STATUS_DISPLAY[status];
}

export function getSummaryCheckInStatusDisplay(status: ClockInStatus): SummaryStatusDisplay {
  return CHECK_IN_STATUS_DISPLAY[status];
}

export function getSummaryCheckOutStatusDisplay(status: ClockOutStatus): SummaryStatusDisplay {
  return CHECK_OUT_STATUS_DISPLAY[status];
}
