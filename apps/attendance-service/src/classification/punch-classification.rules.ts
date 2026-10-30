import type { BusinessDate } from '@dexa/common';

export type CheckInStatusCode =
  'EARLY_CHECKIN' | 'ON_TIME_CHECKIN' | 'LATE_CHECKIN' | 'CHECKIN_NOT_REQUIRED';

export type CheckOutStatusCode =
  'EARLY_CHECKOUT' | 'ON_TIME_CHECKOUT' | 'LATE_CHECKOUT' | 'CHECKOUT_NOT_REQUIRED';

/** The schedule fields the rules read. Plain data, so the rules do not depend on Drizzle row types. */
export type ScheduleVersionInput = {
  readonly timezone: string;
  readonly workingWeekdays: ReadonlyArray<number>;
  /** 24-hour HH:MM, or HH:MM:00 as PostgreSQL `time` returns it. */
  readonly startTime: string;
  readonly endTime: string;
  readonly lateCheckinGraceMinutes: number;
  readonly earlyCheckoutGraceMinutes: number;
  readonly lateCheckoutGraceMinutes: number;
};

/** A company calendar exception for one date (DATABASE §5.3). It overrides the weekday rule in both directions. */
export type CalendarExceptionInput = {
  readonly isWorkingDay: boolean;
};

/**
 * The schedule snapshot for one business date. Working days carry the scheduled instants and the grace minutes;
 * a day off carries neither, so no timing can be classified against it.
 */
export type DaySchedule =
  | {
      readonly isWorkingDay: false;
      readonly timezone: string;
      readonly scheduledStartAt: null;
      readonly scheduledEndAt: null;
    }
  | {
      readonly isWorkingDay: true;
      readonly timezone: string;
      readonly scheduledStartAt: Date;
      readonly scheduledEndAt: Date;
      readonly lateCheckinGraceMinutes: number;
      readonly earlyCheckoutGraceMinutes: number;
      readonly lateCheckoutGraceMinutes: number;
    };

const MS_PER_SECOND = 1_000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::00)?$/;
const ISO_SUNDAY = 7;

/**
 * Resolves whether the business date is a working day and, for working days, the scheduled start and end instants
 * in the schedule's timezone. A calendar exception wins over the weekday rule (DATABASE §5.3).
 */
export function resolveDaySchedule(input: {
  readonly businessDate: BusinessDate;
  readonly scheduleVersion: ScheduleVersionInput;
  readonly calendarException: CalendarExceptionInput | null;
}): DaySchedule {
  const { businessDate, scheduleVersion, calendarException } = input;
  const { timezone } = scheduleVersion;
  const isWorkingDay =
    calendarException?.isWorkingDay ??
    scheduleVersion.workingWeekdays.includes(isoWeekday(businessDate));

  if (!isWorkingDay) {
    return { isWorkingDay: false, timezone, scheduledStartAt: null, scheduledEndAt: null };
  }
  return {
    isWorkingDay: true,
    timezone,
    scheduledStartAt: toZonedInstant(businessDate, scheduleVersion.startTime, timezone),
    scheduledEndAt: toZonedInstant(businessDate, scheduleVersion.endTime, timezone),
    lateCheckinGraceMinutes: scheduleVersion.lateCheckinGraceMinutes,
    earlyCheckoutGraceMinutes: scheduleVersion.earlyCheckoutGraceMinutes,
    lateCheckoutGraceMinutes: scheduleVersion.lateCheckoutGraceMinutes,
  };
}

/**
 * Before the scheduled start is early. From the start through start plus the late grace is on time. Later is late.
 * Punches are compared at whole-minute precision (see floorToMinute), matching the HH:MM times employees see.
 */
export function classifyCheckIn(recordedAt: Date, daySchedule: DaySchedule): CheckInStatusCode {
  if (!daySchedule.isWorkingDay) return 'CHECKIN_NOT_REQUIRED';

  const punchMs = floorToMinute(recordedAt);
  const startMs = daySchedule.scheduledStartAt.getTime();
  if (punchMs < startMs) return 'EARLY_CHECKIN';
  if (punchMs <= startMs + minutesToMs(daySchedule.lateCheckinGraceMinutes)) {
    return 'ON_TIME_CHECKIN';
  }
  return 'LATE_CHECKIN';
}

/**
 * Before the scheduled end minus the early grace is early. From there through the end plus the late grace is on
 * time. Later is late. Punches are compared at whole-minute precision (see floorToMinute).
 */
export function classifyCheckOut(recordedAt: Date, daySchedule: DaySchedule): CheckOutStatusCode {
  if (!daySchedule.isWorkingDay) return 'CHECKOUT_NOT_REQUIRED';

  const punchMs = floorToMinute(recordedAt);
  const endMs = daySchedule.scheduledEndAt.getTime();
  if (punchMs < endMs - minutesToMs(daySchedule.earlyCheckoutGraceMinutes)) return 'EARLY_CHECKOUT';
  if (punchMs <= endMs + minutesToMs(daySchedule.lateCheckoutGraceMinutes)) {
    return 'ON_TIME_CHECKOUT';
  }
  return 'LATE_CHECKOUT';
}

// PRD §5.5 defines the boundaries in minutes, and employees see punches as HH:MM. A punch at 09:15:59 is therefore
// still the 09:15 minute and on time with a 15-minute grace; 09:16:00 is the first late instant.
function floorToMinute(instant: Date): number {
  return Math.floor(instant.getTime() / MS_PER_MINUTE) * MS_PER_MINUTE;
}

function minutesToMs(minutes: number): number {
  return minutes * MS_PER_MINUTE;
}

function parseBusinessDate(businessDate: BusinessDate): {
  readonly year: number;
  readonly month: number;
  readonly day: number;
} {
  const match = CALENDAR_DATE_PATTERN.exec(businessDate);
  if (match === null) throw new RangeError('Business date must use YYYY-MM-DD');

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(0);
  candidate.setUTCFullYear(year, month - 1, day);
  const isRealDate =
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day;
  if (!isRealDate) throw new RangeError('Business date is not a real calendar date');
  return { year, month, day };
}

/** ISO weekday numbers run Monday = 1 to Sunday = 7 (DATABASE §5.2). Pure calendar arithmetic, no timezone. */
function isoWeekday(businessDate: BusinessDate): number {
  const { year, month, day } = parseBusinessDate(businessDate);
  const candidate = new Date(0);
  candidate.setUTCFullYear(year, month - 1, day);
  const sundayBasedWeekday = candidate.getUTCDay();
  return sundayBasedWeekday === 0 ? ISO_SUNDAY : sundayBasedWeekday;
}

/**
 * Converts a wall-clock time on a business date in the schedule's timezone to a UTC instant. Intl supplies the offset
 * in effect at that instant. Two passes make the result correct on a day when the offset changes.
 */
function toZonedInstant(businessDate: BusinessDate, timeOfDay: string, timezone: string): Date {
  const { year, month, day } = parseBusinessDate(businessDate);
  const timeMatch = TIME_OF_DAY_PATTERN.exec(timeOfDay);
  if (timeMatch === null) throw new RangeError('Schedule time must use HH:MM');

  const wallClock = new Date(0);
  wallClock.setUTCFullYear(year, month - 1, day);
  wallClock.setUTCHours(Number(timeMatch[1]), Number(timeMatch[2]), 0, 0);
  const wallClockMs = wallClock.getTime();

  const firstGuessMs = wallClockMs - offsetMilliseconds(wallClockMs, timezone);
  return new Date(wallClockMs - offsetMilliseconds(firstGuessMs, timezone));
}

/** The timezone's offset from UTC at the instant, in milliseconds (positive east of Greenwich). */
function offsetMilliseconds(instantMs: number, timezone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = formatter.formatToParts(new Date(instantMs));
  const wallClock = new Date(0);
  wallClock.setUTCFullYear(
    Number(readPart(parts, 'year')),
    Number(readPart(parts, 'month')) - 1,
    Number(readPart(parts, 'day')),
  );
  wallClock.setUTCHours(
    Number(readPart(parts, 'hour')),
    Number(readPart(parts, 'minute')),
    Number(readPart(parts, 'second')),
    0,
  );
  const wholeSecondInstantMs = Math.floor(instantMs / MS_PER_SECOND) * MS_PER_SECOND;
  return wallClock.getTime() - wholeSecondInstantMs;
}

function readPart(
  parts: ReadonlyArray<Intl.DateTimeFormatPart>,
  type: Intl.DateTimeFormatPartTypes,
): string {
  const part = parts.find((candidate) => candidate.type === type);
  if (part === undefined) throw new Error(`Date formatter returned no ${type} part`);
  return part.value;
}
