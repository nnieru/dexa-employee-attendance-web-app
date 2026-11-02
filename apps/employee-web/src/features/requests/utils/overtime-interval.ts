import { toBusinessInstant, shiftBusinessDate, type BusinessDate } from './business-time.js';

export const ENDS_NEXT_DAY_TEXT = 'Ends the next day (+1 day).';

export type OvertimeInterval = {
  /** The start instant (UTC, Z suffix): the start time on the business date in WIB. */
  startAt: string;
  /** The end instant (UTC, Z suffix): the end time on the business date, or on the next day when it is earlier. */
  endAt: string;
  endsOnNextDay: boolean;
};

type OvertimeClockTimes = {
  businessDate: BusinessDate;
  /** HH:mm in WIB. */
  startTime: string;
  /** HH:mm in WIB. */
  endTime: string;
};

/**
 * An end time earlier than the start time means the overtime runs past midnight, so the end is on the next calendar
 * date. An end equal to the start is not decided here: the form rejects it before this rule runs.
 */
export function isEndTimeOnNextDay(startTime: string, endTime: string): boolean {
  // HH:mm with zero-padded hours and minutes sorts in clock order, so plain comparison is enough.
  return endTime < startTime;
}

/** Converts the employee's WIB clock entries to the instants the API stores. No client clock is read. */
export function toOvertimeInterval({
  businessDate,
  startTime,
  endTime,
}: OvertimeClockTimes): OvertimeInterval {
  const endsOnNextDay = isEndTimeOnNextDay(startTime, endTime);
  const endBusinessDate = endsOnNextDay ? shiftBusinessDate(businessDate, 1) : businessDate;
  return {
    startAt: toBusinessInstant(businessDate, startTime),
    endAt: toBusinessInstant(endBusinessDate, endTime),
    endsOnNextDay,
  };
}

/** The hint under the end time: the next-day rule when both times are set, otherwise the help text. */
export function getEndTimeHint(startTime: string, endTime: string, helpText: string): string {
  if (startTime === '' || endTime === '') return helpText;
  return isEndTimeOnNextDay(startTime, endTime) ? ENDS_NEXT_DAY_TEXT : helpText;
}
