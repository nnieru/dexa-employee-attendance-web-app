import { describe, expect, it } from 'vitest';
import {
  ENDS_NEXT_DAY_TEXT,
  getEndTimeHint,
  isEndTimeOnNextDay,
  toOvertimeInterval,
} from './overtime-interval.js';

const HELP_TEXT = 'Earlier than the start time means the overtime ends after midnight.';

describe('toOvertimeInterval', () => {
  it.each([
    {
      name: 'an evening interval on the business date',
      input: { businessDate: '2026-11-02', startTime: '18:30', endTime: '21:00' },
      startAt: '2026-11-02T11:30:00.000Z',
      endAt: '2026-11-02T14:00:00.000Z',
      endsOnNextDay: false,
    },
    {
      name: 'an interval that ends after midnight, on the next calendar date',
      input: { businessDate: '2026-11-02', startTime: '22:00', endTime: '01:00' },
      startAt: '2026-11-02T15:00:00.000Z',
      endAt: '2026-11-02T18:00:00.000Z',
      endsOnNextDay: true,
    },
    {
      name: 'an interval that starts at WIB midnight',
      input: { businessDate: '2026-11-02', startTime: '00:00', endTime: '02:00' },
      startAt: '2026-11-01T17:00:00.000Z',
      endAt: '2026-11-01T19:00:00.000Z',
      endsOnNextDay: false,
    },
    {
      name: 'an interval that ends at WIB midnight of the next date',
      input: { businessDate: '2026-11-02', startTime: '23:00', endTime: '00:00' },
      startAt: '2026-11-02T16:00:00.000Z',
      endAt: '2026-11-02T17:00:00.000Z',
      endsOnNextDay: true,
    },
    {
      name: 'a next-day end on the last day of a month',
      input: { businessDate: '2026-10-31', startTime: '20:00', endTime: '02:00' },
      startAt: '2026-10-31T13:00:00.000Z',
      endAt: '2026-10-31T19:00:00.000Z',
      endsOnNextDay: true,
    },
  ])('should convert $name to instants in WIB', ({ input, startAt, endAt, endsOnNextDay }) => {
    expect(toOvertimeInterval(input)).toEqual({ startAt, endAt, endsOnNextDay });
  });
});

describe('isEndTimeOnNextDay', () => {
  it.each([
    ['22:00', '01:00', true],
    ['18:30', '21:00', false],
    ['18:30', '18:30', false],
  ])('should be %s-%s next day %s', (startTime, endTime, expected) => {
    expect(isEndTimeOnNextDay(startTime, endTime)).toBe(expected);
  });
});

describe('getEndTimeHint', () => {
  it('should show the next-day line when the end is earlier than the start', () => {
    expect(getEndTimeHint('22:00', '01:00', HELP_TEXT)).toBe(ENDS_NEXT_DAY_TEXT);
  });

  it('should show the help text when the end is later than the start', () => {
    expect(getEndTimeHint('18:30', '21:00', HELP_TEXT)).toBe(HELP_TEXT);
  });

  it('should show the help text when a time is still empty', () => {
    expect(getEndTimeHint('', '01:00', HELP_TEXT)).toBe(HELP_TEXT);
  });
});
