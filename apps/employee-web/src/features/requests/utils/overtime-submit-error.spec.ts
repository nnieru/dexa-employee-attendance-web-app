import { ApiError, FALLBACK_ERROR_MESSAGE } from '@dexa/api-client';
import { ErrorCode } from '@dexa/contracts';
import { describe, expect, it } from 'vitest';
import { mapOvertimeSubmitError } from './overtime-submit-error.js';
import {
  OVERTIME_IDEMPOTENCY_CONFLICT_MESSAGE,
  OVERTIME_SCHEDULE_NOT_CONFIGURED_MESSAGE,
} from './requests-messages.js';

function apiError(code: ErrorCode, message = 'Server message.'): ApiError {
  return new ApiError({ status: 400, code, message });
}

describe('mapOvertimeSubmitError', () => {
  it.each([
    [ErrorCode.OVERTIME_BUSINESS_DATE_OUTSIDE_WINDOW, 'businessDate'],
    [ErrorCode.OVERTIME_START_NOT_ON_BUSINESS_DATE, 'startTime'],
    [ErrorCode.OVERTIME_START_BEFORE_SCHEDULED_END, 'startTime'],
    [ErrorCode.OVERTIME_OVERLAP, 'startTime'],
    [ErrorCode.OVERTIME_END_NOT_AFTER_START, 'endTime'],
    [ErrorCode.OVERTIME_DAILY_CAP_EXCEEDED, 'endTime'],
  ])('should place %s on the %s field with the server message', (code, field) => {
    expect(mapOvertimeSubmitError(apiError(code, 'Server message.'))).toEqual({
      kind: 'field',
      field,
      message: 'Server message.',
    });
  });

  it('should show the schedule message in the general alert when the schedule is not configured', () => {
    expect(mapOvertimeSubmitError(apiError(ErrorCode.SCHEDULE_NOT_CONFIGURED))).toEqual({
      kind: 'general',
      message: OVERTIME_SCHEDULE_NOT_CONFIGURED_MESSAGE,
    });
  });

  it('should show the key conflict message in the general alert when the key was used for other content', () => {
    expect(mapOvertimeSubmitError(apiError(ErrorCode.IDEMPOTENCY_KEY_CONFLICT))).toEqual({
      kind: 'general',
      message: OVERTIME_IDEMPOTENCY_CONFLICT_MESSAGE,
    });
  });

  it('should show the server message in the general alert for an error with no field', () => {
    expect(mapOvertimeSubmitError(apiError(ErrorCode.INTERNAL_ERROR, 'Try again later.'))).toEqual({
      kind: 'general',
      message: 'Try again later.',
    });
  });

  it('should show the fallback message when the error is not an ApiError', () => {
    expect(mapOvertimeSubmitError(new Error('SELECT * FROM overtime_requests'))).toEqual({
      kind: 'general',
      message: FALLBACK_ERROR_MESSAGE,
    });
  });
});
