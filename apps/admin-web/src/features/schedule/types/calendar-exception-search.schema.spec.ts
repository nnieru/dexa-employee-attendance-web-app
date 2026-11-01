import { describe, expect, it } from 'vitest';
import {
  calendarExceptionSearchSchema,
  resolveCalendarExceptionSearch,
} from './calendar-exception-search.schema.js';

describe('calendarExceptionSearchSchema', () => {
  it('should keep a valid range and page', () => {
    expect(
      calendarExceptionSearchSchema.parse({ from: '2026-11-16', to: '2026-12-31', page: '3' }),
    ).toEqual({ from: '2026-11-16', to: '2026-12-31', page: 3 });
  });

  it('should drop an unusable value instead of rejecting the link', () => {
    expect(
      calendarExceptionSearchSchema.parse({ from: 'tomorrow', to: '2026-12-31', page: '0' }),
    ).toEqual({ from: undefined, to: '2026-12-31', page: undefined });
  });
});

describe('resolveCalendarExceptionSearch', () => {
  it('should fill the default range and first page when the URL names none', () => {
    expect(resolveCalendarExceptionSearch({}, '2026-11-15')).toEqual({
      from: '2026-11-16',
      to: '2027-02-28',
      page: 1,
    });
  });

  it('should keep the range and page the URL names', () => {
    expect(
      resolveCalendarExceptionSearch(
        { from: '2026-12-01', to: '2026-12-31', page: 2 },
        '2026-11-15',
      ),
    ).toEqual({ from: '2026-12-01', to: '2026-12-31', page: 2 });
  });
});
