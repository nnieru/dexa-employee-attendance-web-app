import type { AttendanceSummaryItem, CheckInClassification } from '@dexa/contracts';
import type { StatusLabelProps } from '@dexa/ui';

export type SummaryStatusDisplay = {
  text: string;
  tone: NonNullable<StatusLabelProps['tone']>;
};

type ClockOutStatus = AttendanceSummaryItem['clockOutStatus'];

// DESIGN §8 labels. The same timing word has a different treatment at check-in and at check-out, so the two maps are
// separate. This copy repeats the attendance feature's map on purpose: features do not import from each other
// (AGENTS §10). It is a candidate for a shared home once a third screen needs it.
const CHECK_IN_STATUS_DISPLAY: Readonly<Record<CheckInClassification, SummaryStatusDisplay>> = {
  EARLY_CHECKIN: { text: 'Early clock-in', tone: 'neutral' },
  ON_TIME_CHECKIN: { text: 'On-time clock-in', tone: 'success' },
  LATE_CHECKIN: { text: 'Late clock-in', tone: 'warning' },
  CHECKIN_NOT_REQUIRED: { text: 'Not required', tone: 'neutral' },
};

const CHECK_OUT_STATUS_DISPLAY: Readonly<Record<ClockOutStatus, SummaryStatusDisplay>> = {
  EARLY_CHECKOUT: { text: 'Early clock-out', tone: 'warning' },
  ON_TIME_CHECKOUT: { text: 'On-time clock-out', tone: 'success' },
  LATE_CHECKOUT: { text: 'Late clock-out', tone: 'neutral' },
  CHECKOUT_NOT_REQUIRED: { text: 'Not required', tone: 'neutral' },
  PENDING_CHECKOUT: { text: 'Not recorded yet', tone: 'neutral' },
};

export function getSummaryCheckInStatusDisplay(
  classification: CheckInClassification,
): SummaryStatusDisplay {
  return CHECK_IN_STATUS_DISPLAY[classification];
}

export function getSummaryCheckOutStatusDisplay(status: ClockOutStatus): SummaryStatusDisplay {
  return CHECK_OUT_STATUS_DISPLAY[status];
}
