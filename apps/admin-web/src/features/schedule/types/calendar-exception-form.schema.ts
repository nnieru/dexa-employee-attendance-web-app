import { WORK_CALENDAR_DATE_DESCRIPTION_MAX_LENGTH } from '@dexa/contracts';
import { z } from 'zod';
import type { BusinessDate } from '../utils/schedule-business-date.js';

export const CALENDAR_EXCEPTION_TYPE_VALUES = ['holiday', 'specialWorkingDay'] as const;
export type CalendarExceptionType = (typeof CALENDAR_EXCEPTION_TYPE_VALUES)[number];

export const DATE_REQUIRED_MESSAGE = 'Enter the date.';
export const DATE_TOO_EARLY_MESSAGE = 'Choose tomorrow or a later date (WIB).';
export const TYPE_REQUIRED_MESSAGE = 'Choose a holiday or a special working day.';
export const DESCRIPTION_TOO_LONG_MESSAGE = `Use ${WORK_CALENDAR_DATE_DESCRIPTION_MAX_LENGTH} characters or fewer.`;

/**
 * The form's rules. The earliest editable date is passed in, so "tomorrow in WIB" is decided by the caller's clock. The
 * description is trimmed before the length check, the same way the contract trims it. The request is built and checked
 * with the shared contract in toCalendarExceptionSave.
 */
export function createCalendarExceptionFormSchema(earliestEditableDate: BusinessDate) {
  return z.object({
    date: z.iso
      .date({ error: DATE_REQUIRED_MESSAGE })
      .refine((value) => value >= earliestEditableDate, { error: DATE_TOO_EARLY_MESSAGE }),
    exceptionType: z.enum(CALENDAR_EXCEPTION_TYPE_VALUES, { error: TYPE_REQUIRED_MESSAGE }),
    description: z
      .string()
      .refine((value) => value.trim().length <= WORK_CALENDAR_DATE_DESCRIPTION_MAX_LENGTH, {
        error: DESCRIPTION_TOO_LONG_MESSAGE,
      }),
  });
}

export type CalendarExceptionFormValues = z.infer<
  ReturnType<typeof createCalendarExceptionFormSchema>
>;
