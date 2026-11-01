import type { AttendanceDayStatus, AttendanceSummaryItem } from '@dexa/contracts';
import type { StatusLabelProps } from '@dexa/ui';

export type CurrentRecordLabel = {
  text: string;
  tone: NonNullable<StatusLabelProps['tone']>;
};

// DESIGN §8 day labels, with PENDING named "Pending" as the owner asked for this screen. DESIGN §8 proposes
// "Awaiting record" for the same status; this is a recorded difference, not a silent choice.
export const DAY_STATUS_LABEL: Readonly<Record<AttendanceDayStatus, CurrentRecordLabel>> = {
  PENDING: { text: 'Pending', tone: 'neutral' },
  PRESENT: { text: 'Present', tone: 'success' },
  NOT_ATTEND: { text: 'Absent', tone: 'error' },
  SICK_LEAVE: { text: 'Sick leave', tone: 'info' },
  LEAVE: { text: 'Leave', tone: 'info' },
  DAY_OFF: { text: 'Day off', tone: 'neutral' },
};

type ClockInStatus = AttendanceSummaryItem['clockInStatus'];
type ClockOutStatus = AttendanceSummaryItem['clockOutStatus'];

// DESIGN §8 check-in and check-out labels. A copy of the History feature's maps: features do not import each other
// (AGENTS §10). The same timing word means different things at check-in and at check-out, so the maps are separate.
export const CHECK_IN_LABEL: Readonly<Record<ClockInStatus, CurrentRecordLabel>> = {
  EARLY_CHECKIN: { text: 'Early clock-in', tone: 'neutral' },
  ON_TIME_CHECKIN: { text: 'On-time clock-in', tone: 'success' },
  LATE_CHECKIN: { text: 'Late clock-in', tone: 'warning' },
  CHECKIN_NOT_REQUIRED: { text: 'Not required', tone: 'neutral' },
  PENDING_CHECKIN: { text: 'Not recorded yet', tone: 'neutral' },
};

export const CHECK_OUT_LABEL: Readonly<Record<ClockOutStatus, CurrentRecordLabel>> = {
  EARLY_CHECKOUT: { text: 'Early clock-out', tone: 'warning' },
  ON_TIME_CHECKOUT: { text: 'On-time clock-out', tone: 'success' },
  LATE_CHECKOUT: { text: 'Late clock-out', tone: 'neutral' },
  CHECKOUT_NOT_REQUIRED: { text: 'Not required', tone: 'neutral' },
  PENDING_CHECKOUT: { text: 'Not recorded yet', tone: 'neutral' },
};
