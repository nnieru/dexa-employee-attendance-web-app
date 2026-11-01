import { describe, expect, it } from 'vitest';
import {
  getEarliestEditableExceptionDate,
  getWeekdayLabel,
  isEditableCalendarExceptionDate,
} from './calendar-exception-dates.js';

describe('getEarliestEditableExceptionDate', () => {
  it.each([
    ['2026-11-15', '2026-11-16'],
    ['2026-10-31', '2026-11-01'],
    ['2026-12-31', '2027-01-01'],
  ])('should give the day after %s as the first editable date', (today, expected) => {
    expect(getEarliestEditableExceptionDate(today)).toBe(expected);
  });
});

describe('isEditableCalendarExceptionDate', () => {
  it.each([
    ['2026-11-14', false],
    ['2026-11-15', false],
    ['2026-11-16', true],
    ['2027-03-01', true],
  ])('should treat %s as editable only after today 2026-11-15 WIB: %s', (date, expected) => {
    expect(isEditableCalendarExceptionDate(date, '2026-11-15')).toBe(expected);
  });
});

describe('getWeekdayLabel', () => {
  it.each([
    ['2026-11-07', 'Sat'],
    ['2026-11-08', 'Sun'],
    ['2026-11-09', 'Mon'],
  ])('should name the weekday of %s as %s', (date, expected) => {
    expect(getWeekdayLabel(date)).toBe(expected);
  });
});
