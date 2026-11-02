import {
  REQUEST_REASON_MAX_LENGTH,
  requestedCorrectionDayStatusSchema,
  type SubmitCorrectionRequest,
} from '@dexa/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CLOCK_TIME_PATTERN, toBusinessInstant, type BusinessDate } from './business-time.js';
import {
  isSelectableCorrectionDate,
  CORRECTION_BUSINESS_DATE_WINDOW_DAYS,
} from './correction-date-window.js';

export const CORRECTION_FORM_MESSAGES = {
  businessDateRequired: 'Choose the business date.',
  businessDateOutsideWindow: `Choose today or a date up to ${CORRECTION_BUSINESS_DATE_WINDOW_DAYS} days back.`,
  clockInRequired: 'Enter the clock-in time for a present day.',
  clockTimeInvalid: 'Enter the time as HH:mm.',
  clockOutNotAfterClockIn: 'Clock-out must be after clock-in.',
  reasonRequired: 'Enter a reason for this request.',
  reasonTooLong: `Use ${REQUEST_REASON_MAX_LENGTH} characters or fewer.`,
} as const;

/**
 * The form's own rules, for messages on the fields before a request is sent. Times are checked only for Present:
 * a leave outcome ignores any time that was typed before the outcome changed. "Today" is passed in, so the rules are
 * pure and testable. The contract schema still decides the request that is sent.
 */
export function createCorrectionRequestFormSchema(today: BusinessDate) {
  return z
    .object({
      requestedDayStatus: requestedCorrectionDayStatusSchema,
      businessDate: z
        .string()
        .min(1, { error: CORRECTION_FORM_MESSAGES.businessDateRequired })
        .refine((value) => isSelectableCorrectionDate(value, today), {
          error: CORRECTION_FORM_MESSAGES.businessDateOutsideWindow,
        }),
      clockInTime: z.string(),
      clockOutTime: z.string(),
      reason: z
        .string()
        .trim()
        .min(1, { error: CORRECTION_FORM_MESSAGES.reasonRequired })
        .max(REQUEST_REASON_MAX_LENGTH, { error: CORRECTION_FORM_MESSAGES.reasonTooLong }),
    })
    .superRefine((values, context) => {
      if (values.requestedDayStatus !== 'PRESENT') return;
      addPresentTimeIssues(values, context);
    });
}

type PresentTimeValues = { clockInTime: string; clockOutTime: string };

function addPresentTimeIssues(values: PresentTimeValues, context: z.RefinementCtx): void {
  if (values.clockInTime === '') {
    addFieldIssue(context, 'clockInTime', CORRECTION_FORM_MESSAGES.clockInRequired);
    return;
  }
  if (!CLOCK_TIME_PATTERN.test(values.clockInTime)) {
    addFieldIssue(context, 'clockInTime', CORRECTION_FORM_MESSAGES.clockTimeInvalid);
    return;
  }
  if (values.clockOutTime === '') return;
  if (!CLOCK_TIME_PATTERN.test(values.clockOutTime)) {
    addFieldIssue(context, 'clockOutTime', CORRECTION_FORM_MESSAGES.clockTimeInvalid);
    return;
  }
  // HH:mm on the same business date compares correctly as text. Corrections never cross midnight.
  if (values.clockOutTime <= values.clockInTime) {
    addFieldIssue(context, 'clockOutTime', CORRECTION_FORM_MESSAGES.clockOutNotAfterClockIn);
  }
}

function addFieldIssue(
  context: z.RefinementCtx,
  field: 'clockInTime' | 'clockOutTime',
  message: string,
): void {
  context.addIssue({ code: 'custom', message, path: [field] });
}

export type CorrectionRequestFormValues = z.infer<
  ReturnType<typeof createCorrectionRequestFormSchema>
>;

export function createCorrectionRequestFormResolver(today: BusinessDate) {
  return zodResolver(createCorrectionRequestFormSchema(today));
}

/** The request content without the idempotency key. The key is excluded, so a retry compares only what the employee entered. */
type DistributiveOmit<TValue, TKey extends PropertyKey> = TValue extends unknown
  ? Omit<TValue, TKey>
  : never;
export type CorrectionRequestPayload = DistributiveOmit<SubmitCorrectionRequest, 'idempotencyKey'>;

/**
 * The request content from valid form values. Present sends the clock-in instant, and the clock-out only when one was
 * entered (the key is left out, not set to null, because the contract refuses null). A leave outcome sends no time key
 * at all, whatever was typed before the outcome changed. Call only on values that passed the form schema.
 */
export function toCorrectionRequestPayload(
  values: CorrectionRequestFormValues,
): CorrectionRequestPayload {
  const { businessDate } = values;
  const reason = values.reason.trim();
  if (values.requestedDayStatus !== 'PRESENT') {
    return { requestedDayStatus: values.requestedDayStatus, businessDate, reason };
  }
  const presentPayload = {
    requestedDayStatus: 'PRESENT' as const,
    businessDate,
    clockInAt: toBusinessInstant(businessDate, values.clockInTime),
    reason,
  };
  if (values.clockOutTime === '') return presentPayload;
  return {
    ...presentPayload,
    clockOutAt: toBusinessInstant(businessDate, values.clockOutTime),
  };
}
