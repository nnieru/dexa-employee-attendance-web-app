import { addCalendarDays, type BusinessDate } from './schedule-business-date.js';

// Sunday first, the order of JavaScript's getUTCDay().
const WEEKDAY_LABELS: ReadonlyArray<string> = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const NO_WEEKDAY_LABEL = '';

/**
 * The first date an exception may be added, changed, or removed: tomorrow in the company
 * timezone. Today and earlier dates are read-only, so attendance already recorded on them cannot change.
 */
export function getEarliestEditableExceptionDate(today: BusinessDate): BusinessDate {
  return addCalendarDays(today, 1);
}

/** Whether the row for this date may show edit and remove controls. Pure: the caller supplies today. */
export function isEditableCalendarExceptionDate(date: BusinessDate, today: BusinessDate): boolean {
  return date >= getEarliestEditableExceptionDate(today);
}

/** The short weekday name of a business date, for example "Sat" for 2026-11-07. */
export function getWeekdayLabel(date: BusinessDate): string {
  const dayIndex = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return WEEKDAY_LABELS[dayIndex] ?? NO_WEEKDAY_LABEL;
}
