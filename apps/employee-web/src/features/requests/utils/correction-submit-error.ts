import { ApiError, FALLBACK_ERROR_MESSAGE } from '@dexa/api-client';
import { ErrorCode } from '@dexa/contracts';
import type { CorrectionRequestFormValues } from './correction-request-form.schema.js';
import {
  CORRECTION_ALREADY_PENDING_MESSAGE,
  CORRECTION_SCHEDULE_NOT_CONFIGURED_MESSAGE,
  OVERTIME_IDEMPOTENCY_CONFLICT_MESSAGE,
} from './requests-messages.js';

export type CorrectionFormField = keyof Pick<
  CorrectionRequestFormValues,
  'businessDate' | 'clockInTime' | 'clockOutTime'
>;

/** Where a refused submission is shown: next to the field the rule is about, or in the form's general alert. */
export type CorrectionSubmitFailure =
  | { kind: 'field'; field: CorrectionFormField; message: string }
  | { kind: 'general'; message: string };

// Each policy code names the field it is about (PRD COR-1, COR-2). The server message is user-safe, so it is shown as is.
const FIELD_BY_ERROR_CODE: Partial<Record<ErrorCode, CorrectionFormField>> = {
  [ErrorCode.CORRECTION_BUSINESS_DATE_OUTSIDE_WINDOW]: 'businessDate',
  [ErrorCode.CORRECTION_CLOCK_IN_REQUIRED]: 'clockInTime',
  [ErrorCode.CORRECTION_CLOCK_IN_OUTSIDE_BUSINESS_DATE]: 'clockInTime',
  [ErrorCode.CORRECTION_CLOCK_IN_IN_FUTURE]: 'clockInTime',
  [ErrorCode.CORRECTION_CLOCK_OUT_OUTSIDE_BUSINESS_DATE]: 'clockOutTime',
  [ErrorCode.CORRECTION_CLOCK_OUT_IN_FUTURE]: 'clockOutTime',
  [ErrorCode.CORRECTION_CLOCK_OUT_NOT_AFTER_CLOCK_IN]: 'clockOutTime',
};

const GENERAL_MESSAGE_BY_ERROR_CODE: Partial<Record<ErrorCode, string>> = {
  [ErrorCode.CORRECTION_ALREADY_PENDING]: CORRECTION_ALREADY_PENDING_MESSAGE,
  [ErrorCode.IDEMPOTENCY_KEY_CONFLICT]: OVERTIME_IDEMPOTENCY_CONFLICT_MESSAGE,
  [ErrorCode.SCHEDULE_NOT_CONFIGURED]: CORRECTION_SCHEDULE_NOT_CONFIGURED_MESSAGE,
};

/**
 * Turns a failed submission into one message and its place on the form. Input is kept by the caller. Times that are not
 * allowed for a leave outcome have no field of their own, so the server message goes in the general alert.
 */
export function mapCorrectionSubmitError(error: unknown): CorrectionSubmitFailure {
  if (!(error instanceof ApiError)) {
    return { kind: 'general', message: FALLBACK_ERROR_MESSAGE };
  }
  const field = FIELD_BY_ERROR_CODE[error.code];
  if (field !== undefined) {
    return { kind: 'field', field, message: error.message };
  }
  return { kind: 'general', message: GENERAL_MESSAGE_BY_ERROR_CODE[error.code] ?? error.message };
}
