import { z } from 'zod';
import type { BusinessDate } from '../utils/schedule-business-date.js';
import { WORKING_WEEKDAY_VALUES } from '../utils/work-schedule-weekdays.js';

export const WORKING_DAY_REQUIRED_MESSAGE = 'Select at least one working day.';
export const START_TIME_REQUIRED_MESSAGE = 'Enter the start time.';
export const END_TIME_REQUIRED_MESSAGE = 'Enter the end time.';
export const TIME_ORDER_MESSAGE = 'The end time must be after the start time.';
export const GRACE_MINUTES_MESSAGE = 'Enter whole minutes, 0 or more.';
export const EFFECTIVE_FROM_REQUIRED_MESSAGE = 'Enter the date the version takes effect.';
export const EFFECTIVE_FROM_TOO_EARLY_MESSAGE = 'Choose tomorrow or a later date (WIB).';

// HH:mm in 24 hours, the shape of the contract's clock times.
const CLOCK_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const WHOLE_MINUTES_PATTERN = /^\d+$/;

function clockTimeField(requiredMessage: string) {
  return z.string().regex(CLOCK_TIME_PATTERN, { error: requiredMessage });
}

const wholeMinutesField = z.string().regex(WHOLE_MINUTES_PATTERN, { error: GRACE_MINUTES_MESSAGE });

/**
 * The form's rules, with messages for each field. Every value is a string, because inputs produce strings. The
 * earliest effective date is passed in, so "tomorrow in WIB" is decided by the caller's clock, not by this module.
 * The request is still built and checked with the shared contract (toWorkScheduleVersionRequest).
 */
export function createWorkScheduleFormSchema(earliestEffectiveFrom: BusinessDate) {
  return z
    .object({
      workingWeekdays: z
        .array(z.enum(WORKING_WEEKDAY_VALUES))
        .min(1, { error: WORKING_DAY_REQUIRED_MESSAGE }),
      startTime: clockTimeField(START_TIME_REQUIRED_MESSAGE),
      endTime: clockTimeField(END_TIME_REQUIRED_MESSAGE),
      lateCheckinGraceMinutes: wholeMinutesField,
      earlyCheckoutGraceMinutes: wholeMinutesField,
      lateCheckoutGraceMinutes: wholeMinutesField,
      effectiveFrom: z.iso
        .date({ error: EFFECTIVE_FROM_REQUIRED_MESSAGE })
        .refine((value) => value >= earliestEffectiveFrom, {
          error: EFFECTIVE_FROM_TOO_EARLY_MESSAGE,
        }),
    })
    .refine((values) => values.startTime < values.endTime, {
      error: TIME_ORDER_MESSAGE,
      path: ['endTime'],
    });
}

export type WorkScheduleFormValues = z.infer<ReturnType<typeof createWorkScheduleFormSchema>>;
