import type { CheckInClassification, CheckOutClassification } from '@dexa/contracts';
import type { StatusLabelProps } from '@dexa/ui';

export type PunchStatusDisplay = {
  text: string;
  tone: NonNullable<StatusLabelProps['tone']>;
};

const NOT_REQUIRED_TEXT = 'Not required';

// The same timing word has a different treatment at check-in and at check-out, so the two maps are separate.
const CHECK_IN_STATUS_DISPLAY: Readonly<Record<CheckInClassification, PunchStatusDisplay>> = {
  EARLY_CHECKIN: { text: 'Early clock-in', tone: 'neutral' },
  ON_TIME_CHECKIN: { text: 'On-time clock-in', tone: 'success' },
  LATE_CHECKIN: { text: 'Late clock-in', tone: 'warning' },
  CHECKIN_NOT_REQUIRED: { text: NOT_REQUIRED_TEXT, tone: 'neutral' },
};

const CHECK_OUT_STATUS_DISPLAY: Readonly<Record<CheckOutClassification, PunchStatusDisplay>> = {
  EARLY_CHECKOUT: { text: 'Early clock-out', tone: 'warning' },
  ON_TIME_CHECKOUT: { text: 'On-time clock-out', tone: 'success' },
  LATE_CHECKOUT: { text: 'Late clock-out', tone: 'neutral' },
  CHECKOUT_NOT_REQUIRED: { text: NOT_REQUIRED_TEXT, tone: 'neutral' },
};

export function getCheckInStatusDisplay(classification: CheckInClassification): PunchStatusDisplay {
  return CHECK_IN_STATUS_DISPLAY[classification];
}

export function getCheckOutStatusDisplay(
  classification: CheckOutClassification,
): PunchStatusDisplay {
  return CHECK_OUT_STATUS_DISPLAY[classification];
}
