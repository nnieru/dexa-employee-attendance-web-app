import {
  buildWorkCalendarDatePage,
  buildWorkCalendarDateValues,
  isCalendarDateEditable,
} from './work-calendar-date.rules.js';

describe('isCalendarDateEditable', () => {
  it.each([
    {
      condition: 'the date is the day after the business date',
      date: '2026-11-03',
      expected: true,
    },
    { condition: 'the date is well after the business date', date: '2027-01-01', expected: true },
    { condition: 'the date is the business date', date: '2026-11-02', expected: false },
    { condition: 'the date is before the business date', date: '2026-11-01', expected: false },
    { condition: 'the date is a year before', date: '2025-11-03', expected: false },
  ])('should return $expected when $condition', ({ date, expected }) => {
    expect(isCalendarDateEditable(date, '2026-11-02')).toBe(expected);
  });

  it('should allow the first day of a month after the last day of the previous month', () => {
    expect(isCalendarDateEditable('2026-12-01', '2026-11-30')).toBe(true);
  });
});

describe('buildWorkCalendarDateValues', () => {
  it('should store the description the request carries', () => {
    expect(
      buildWorkCalendarDateValues('2026-11-09', { isWorkingDay: false, description: 'Holiday' }),
    ).toEqual({ date: '2026-11-09', isWorkingDay: false, description: 'Holiday' });
  });

  it('should store a null description when the request carries none', () => {
    expect(buildWorkCalendarDateValues('2026-11-09', { isWorkingDay: true })).toEqual({
      date: '2026-11-09',
      isWorkingDay: true,
      description: null,
    });
  });
});

describe('buildWorkCalendarDatePage', () => {
  it('should report the page, page size, item count and page count', () => {
    const dates = [{ date: '2026-11-09', isWorkingDay: false, description: 'Holiday' }];

    expect(buildWorkCalendarDatePage({ dates, totalItems: 41 }, { page: 2, pageSize: 20 })).toEqual(
      {
        items: dates,
        page: 2,
        pageSize: 20,
        totalItems: 41,
        totalPages: 3,
      },
    );
  });
});
