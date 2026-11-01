import { isBusinessDate, shiftBusinessDate, type BusinessDate } from './business-time.js';

// PRD COR-1: the business date is today or up to this many days back.
export const CORRECTION_BUSINESS_DATE_WINDOW_DAYS = 30;

export type CorrectionDateBounds = {
  /** The oldest selectable date: today minus the window. */
  earliest: BusinessDate;
  /** The newest selectable date: today. */
  latest: BusinessDate;
};

export function getCorrectionDateBounds(today: BusinessDate): CorrectionDateBounds {
  return {
    earliest: shiftBusinessDate(today, -CORRECTION_BUSINESS_DATE_WINDOW_DAYS),
    latest: today,
  };
}

/** True for a real calendar date that is today or up to the window back, in WIB. Pure: today is passed in. */
export function isSelectableCorrectionDate(value: string, today: BusinessDate): boolean {
  if (!isBusinessDate(value)) return false;
  const { earliest, latest } = getCorrectionDateBounds(today);
  return value >= earliest && value <= latest;
}
