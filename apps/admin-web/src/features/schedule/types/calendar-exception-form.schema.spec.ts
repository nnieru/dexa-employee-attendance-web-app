import { describe, expect, it } from 'vitest';
import {
  DATE_REQUIRED_MESSAGE,
  DATE_TOO_EARLY_MESSAGE,
  DESCRIPTION_TOO_LONG_MESSAGE,
  TYPE_REQUIRED_MESSAGE,
  createCalendarExceptionFormSchema,
  type CalendarExceptionFormValues,
} from './calendar-exception-form.schema.js';

const EARLIEST_EDITABLE_DATE = '2026-11-16';

const VALID_VALUES: CalendarExceptionFormValues = {
  date: '2026-11-20',
  exceptionType: 'holiday',
  description: 'Company holiday',
};

function getIssueMessages(values: Partial<CalendarExceptionFormValues>): Array<string> {
  const result = createCalendarExceptionFormSchema(EARLIEST_EDITABLE_DATE).safeParse(values);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe('createCalendarExceptionFormSchema', () => {
  it('should accept a future date with a type and a description', () => {
    expect(getIssueMessages(VALID_VALUES)).toEqual([]);
  });

  it('should accept the earliest editable date itself', () => {
    expect(getIssueMessages({ ...VALID_VALUES, date: EARLIEST_EDITABLE_DATE })).toEqual([]);
  });

  it('should refuse a date that is today or earlier in WIB', () => {
    expect(getIssueMessages({ ...VALID_VALUES, date: '2026-11-15' })).toEqual([
      DATE_TOO_EARLY_MESSAGE,
    ]);
  });

  it('should refuse an empty date', () => {
    expect(getIssueMessages({ ...VALID_VALUES, date: '' })).toContain(DATE_REQUIRED_MESSAGE);
  });

  it('should refuse a missing type', () => {
    expect(getIssueMessages({ ...VALID_VALUES, exceptionType: undefined })).toContain(
      TYPE_REQUIRED_MESSAGE,
    );
  });

  it('should count the description after trimming, so 255 characters with spaces around them pass', () => {
    const description = `  ${'a'.repeat(255)}  `;
    expect(getIssueMessages({ ...VALID_VALUES, description })).toEqual([]);
  });

  it('should refuse a description longer than 255 characters', () => {
    expect(getIssueMessages({ ...VALID_VALUES, description: 'a'.repeat(256) })).toContain(
      DESCRIPTION_TOO_LONG_MESSAGE,
    );
  });
});
