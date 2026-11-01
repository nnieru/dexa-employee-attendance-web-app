import { ApiError, FALLBACK_ERROR_MESSAGE } from '@dexa/api-client';
import { ErrorCode } from '@dexa/contracts';
import type { OvertimeRequestFormValues } from './overtime-request-form.schema.js';
import {
  OVERTIME_SCHEDULE_NOT_CONFIGURED_MESSAGE,
  OVERTIME_IDEMPOTENCY_CONFLICT_MESSAGE,
} from './requests-messages.js';

export type OvertimeFormField = keyof Pick<
  OvertimeRequestFormValues,
  'businessDate' | 'startTime' | 'endTime'
>;

/** Where a refused submission is shown: next to the field the rule is about, or in the form's general alert. */
export type OvertimeSubmitFailure =
  | { kind: 'field'; field: OvertimeFormField; message: string }
  | { kind: 'general'; message: string };

// Each policy code names the field it is about (PRD OT-2..OT-5). The server message is user-safe, so it is shown as is.
// A start-time conflict with the schedule or with another request is on the start field; the cap is on the end field.
const FIELD_BY_ERROR_CODE: Partial<Record<ErrorCode, OvertimeFormField>> = {
  [ErrorCode.OVERTIME_BUSINESS_DATE_OUTSIDE_WINDOW]: 'businessDate',
  [ErrorCode.OVERTIME_START_NOT_ON_BUSINESS_DATE]: 'startTime',
  [ErrorCode.OVERTIME_START_BEFORE_SCHEDULED_END]: 'startTime',
  [ErrorCode.OVERTIME_OVERLAP]: 'startTime',
  [ErrorCode.OVERTIME_END_NOT_AFTER_START]: 'endTime',
  [ErrorCode.OVERTIME_DAILY_CAP_EXCEEDED]: 'endTime',
};

const GENERAL_MESSAGE_BY_ERROR_CODE: Partial<Record<ErrorCode, string>> = {
  [ErrorCode.SCHEDULE_NOT_CONFIGURED]: OVERTIME_SCHEDULE_NOT_CONFIGURED_MESSAGE,
  [ErrorCode.IDEMPOTENCY_KEY_CONFLICT]: OVERTIME_IDEMPOTENCY_CONFLICT_MESSAGE,
};

/** Turns a failed submission into one message and its place on the form. Input is kept by the caller. */
export function mapOvertimeSubmitError(error: unknown): OvertimeSubmitFailure {
  if (!(error instanceof ApiError)) {
    return { kind: 'general', message: FALLBACK_ERROR_MESSAGE };
  }
  const field = FIELD_BY_ERROR_CODE[error.code];
  if (field !== undefined) {
    return { kind: 'field', field, message: error.message };
  }
  const generalMessage = GENERAL_MESSAGE_BY_ERROR_CODE[error.code];
  return { kind: 'general', message: generalMessage ?? error.message };
}
