import { describe, expect, it } from 'vitest';
import type { CalendarExceptionFormValues } from '../types/calendar-exception-form.schema.js';
import { toCalendarExceptionSave } from './to-calendar-exception-save.js';

describe('toCalendarExceptionSave', () => {
  it('should send a holiday as a non-working day with the trimmed description', () => {
    const values: CalendarExceptionFormValues = {
      date: '2026-11-20',
      exceptionType: 'holiday',
      description: '  Company holiday  ',
    };
    expect(toCalendarExceptionSave(values)).toEqual({
      date: '2026-11-20',
      request: { isWorkingDay: false, description: 'Company holiday' },
    });
  });

  it('should send a special working day as a working day', () => {
    const values: CalendarExceptionFormValues = {
      date: '2026-11-28',
      exceptionType: 'specialWorkingDay',
      description: '',
    };
    expect(toCalendarExceptionSave(values)).toEqual({
      date: '2026-11-28',
      request: { isWorkingDay: true },
    });
  });

  it('should omit a description that is only spaces', () => {
    const values: CalendarExceptionFormValues = {
      date: '2026-11-20',
      exceptionType: 'holiday',
      description: '   ',
    };
    expect(toCalendarExceptionSave(values).request).toEqual({ isWorkingDay: false });
  });

  it('should throw when the date is not a calendar date, so the caller can show an alert', () => {
    const values: CalendarExceptionFormValues = {
      date: 'not-a-date',
      exceptionType: 'holiday',
      description: '',
    };
    expect(() => toCalendarExceptionSave(values)).toThrow();
  });
});
