import { ApiError, FALLBACK_ERROR_MESSAGE } from '@dexa/api-client';
import { ErrorCode } from '@dexa/contracts';
import { describe, expect, it } from 'vitest';
import { mapCorrectionSubmitError } from './correction-submit-error.js';
import {
  CORRECTION_ALREADY_PENDING_MESSAGE,
  CORRECTION_SCHEDULE_NOT_CONFIGURED_MESSAGE,
  OVERTIME_IDEMPOTENCY_CONFLICT_MESSAGE,
} from './requests-messages.js';

function apiError(code: ErrorCode, message = 'Server message.'): ApiError {
  return new ApiError({ status: 409, code, message });
}

describe('mapCorrectionSubmitError', () => {
  it.each([
    [ErrorCode.CORRECTION_BUSINESS_DATE_OUTSIDE_WINDOW, 'businessDate'],
    [ErrorCode.CORRECTION_CLOCK_IN_REQUIRED, 'clockInTime'],
    [ErrorCode.CORRECTION_CLOCK_IN_OUTSIDE_BUSINESS_DATE, 'clockInTime'],
    [ErrorCode.CORRECTION_CLOCK_IN_IN_FUTURE, 'clockInTime'],
    [ErrorCode.CORRECTION_CLOCK_OUT_OUTSIDE_BUSINESS_DATE, 'clockOutTime'],
    [ErrorCode.CORRECTION_CLOCK_OUT_IN_FUTURE, 'clockOutTime'],
    [ErrorCode.CORRECTION_CLOCK_OUT_NOT_AFTER_CLOCK_IN, 'clockOutTime'],
  ])('should show %s on the %s field with the server message', (code, field) => {
    expect(mapCorrectionSubmitError(apiError(code, 'Server message.'))).toEqual({
      kind: 'field',
      field,
      message: 'Server message.',
    });
  });

  it.each([
    [ErrorCode.CORRECTION_ALREADY_PENDING, CORRECTION_ALREADY_PENDING_MESSAGE],
    [ErrorCode.IDEMPOTENCY_KEY_CONFLICT, OVERTIME_IDEMPOTENCY_CONFLICT_MESSAGE],
    [ErrorCode.SCHEDULE_NOT_CONFIGURED, CORRECTION_SCHEDULE_NOT_CONFIGURED_MESSAGE],
  ])('should show the fixed general message for %s', (code, message) => {
    expect(mapCorrectionSubmitError(apiError(code, 'Raw server text.'))).toEqual({
      kind: 'general',
      message,
    });
  });

  it('should show the server message in the general alert for a leave with times', () => {
    expect(
      mapCorrectionSubmitError(
        apiError(ErrorCode.CORRECTION_TIMES_NOT_ALLOWED_FOR_LEAVE, 'Leave has no times.'),
      ),
    ).toEqual({ kind: 'general', message: 'Leave has no times.' });
  });

  it('should show the fallback message when the failure is not an API error', () => {
    expect(mapCorrectionSubmitError(new Error('network down'))).toEqual({
      kind: 'general',
      message: FALLBACK_ERROR_MESSAGE,
    });
  });
});
