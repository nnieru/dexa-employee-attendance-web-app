import type { TodayAttendanceResponse } from '@dexa/contracts';
import { DAY_OFF_TEXT } from './attendance-copy.js';

// The company timezone as an IANA name, so daylight rules stay correct if the zone ever changes. The server's
// BUSINESS_TIMEZONE is not sent to the browser, and no shared frontend helper exists, so the name is kept here.
const BUSINESS_TIME_ZONE = 'Asia/Jakarta';
const BUSINESS_TIME_LABEL = 'WIB';
const SCHEDULE_RANGE_SEPARATOR = ' to ';

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: BUSINESS_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// A calendar date has no time of day, so it is formatted in UTC: the browser's zone cannot move it to another day.
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** HH:mm in the company timezone for a server instant, for example "08:02 WIB". */
export function formatBusinessTime(instant: string): string {
  return `${timeFormatter.format(new Date(instant))} ${BUSINESS_TIME_LABEL}`;
}

/** A YYYY-MM-DD business date as a readable date, for example "Sunday, November 1, 2026". */
export function formatBusinessDate(businessDate: string): string {
  return dateFormatter.format(new Date(`${businessDate}T00:00:00Z`));
}

/** Today's scheduled hours, or the day-off text when there is no schedule for today. */
export function formatScheduledHours(today: TodayAttendanceResponse): string {
  if (!today.isWorkingDay) return DAY_OFF_TEXT;
  const start = formatBusinessTime(today.scheduledStartAt);
  const end = formatBusinessTime(today.scheduledEndAt);
  return `${start}${SCHEDULE_RANGE_SEPARATOR}${end}`;
}
