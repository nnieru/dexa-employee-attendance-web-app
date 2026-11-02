import { REQUEST_REASON_MAX_LENGTH } from '@dexa/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  CLOCK_TIME_PATTERN,
  isBusinessDate,
  shiftBusinessDate,
  type BusinessDate,
} from './business-time.js';
import { toOvertimeInterval } from './overtime-interval.js';
import type { OvertimeRequestPayload } from './idempotency-key.js';

// The business date is today or up to this many days back.
const OVERTIME_BUSINESS_DATE_WINDOW_DAYS = 7;

export const OVERTIME_FORM_MESSAGES = {
  businessDateRequired: 'Choose the business date.',
  businessDateOutsideWindow: `Choose today or a date up to ${OVERTIME_BUSINESS_DATE_WINDOW_DAYS} days back.`,
  startTimeRequired: 'Enter the start time.',
  endTimeRequired: 'Enter the end time.',
  endNotAfterStart: 'The overtime must end after it starts.',
  reasonRequired: 'Enter a reason for this request.',
  reasonTooLong: `Use ${REQUEST_REASON_MAX_LENGTH} characters or fewer.`,
} as const;

export type OvertimeBusinessDateBounds = {
  /** The oldest selectable date: today minus the window. */
  earliest: BusinessDate;
  /** The newest selectable date: today. */
  latest: BusinessDate;
};

export function getOvertimeBusinessDateBounds(today: BusinessDate): OvertimeBusinessDateBounds {
  return {
    earliest: shiftBusinessDate(today, -OVERTIME_BUSINESS_DATE_WINDOW_DAYS),
    latest: today,
  };
}

/**
 * The form's own rules, for messages on the fields before a request is sent. The contract schema still decides the
 * request that is sent (submitOvertimeRequestSchema). "Today" is passed in, so the rule is pure and testable.
 */
export function createOvertimeRequestFormSchema(today: BusinessDate) {
  const { earliest, latest } = getOvertimeBusinessDateBounds(today);
  return z
    .object({
      businessDate: z
        .string()
        .min(1, { error: OVERTIME_FORM_MESSAGES.businessDateRequired })
        .refine((value) => isBusinessDate(value) && value >= earliest && value <= latest, {
          error: OVERTIME_FORM_MESSAGES.businessDateOutsideWindow,
        }),
      startTime: z
        .string()
        .regex(CLOCK_TIME_PATTERN, { error: OVERTIME_FORM_MESSAGES.startTimeRequired }),
      endTime: z
        .string()
        .regex(CLOCK_TIME_PATTERN, { error: OVERTIME_FORM_MESSAGES.endTimeRequired }),
      reason: z
        .string()
        .trim()
        .min(1, { error: OVERTIME_FORM_MESSAGES.reasonRequired })
        .max(REQUEST_REASON_MAX_LENGTH, { error: OVERTIME_FORM_MESSAGES.reasonTooLong }),
    })
    .refine((values) => values.endTime !== values.startTime, {
      error: OVERTIME_FORM_MESSAGES.endNotAfterStart,
      path: ['endTime'],
    });
}

export type OvertimeRequestFormValues = z.infer<ReturnType<typeof createOvertimeRequestFormSchema>>;

export function createOvertimeRequestFormResolver(today: BusinessDate) {
  return zodResolver(createOvertimeRequestFormSchema(today));
}

/** The request content from valid form values: instants from the WIB clock entries, and the trimmed reason. */
export function toOvertimeRequestPayload(
  values: OvertimeRequestFormValues,
): OvertimeRequestPayload {
  const interval = toOvertimeInterval(values);
  return {
    businessDate: values.businessDate,
    startAt: interval.startAt,
    endAt: interval.endAt,
    reason: values.reason.trim(),
  };
}
