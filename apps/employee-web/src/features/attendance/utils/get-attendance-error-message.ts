import { ApiError, FALLBACK_ERROR_MESSAGE } from '@dexa/api-client';
import { ErrorCode } from '@dexa/contracts';
import { DAY_ON_LEAVE_MESSAGE, SCHEDULE_NOT_CONFIGURED_MESSAGE } from './attendance-copy.js';

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof ApiError && error.code === code;
}

/** True when no work schedule covers the day, so attendance cannot be recorded or shown. */
export function isScheduleNotConfiguredError(error: unknown): boolean {
  return hasErrorCode(error, ErrorCode.SCHEDULE_NOT_CONFIGURED);
}

/** True when the day is an approved Sick leave or Leave, so a punch is refused. */
export function isDayOnLeaveError(error: unknown): boolean {
  return hasErrorCode(error, ErrorCode.ATTENDANCE_DAY_ON_LEAVE);
}

/** The message for a failed punch. Known codes get employee copy; other ApiError messages are user-safe; anything else gets the generic fallback. */
export function getAttendanceErrorMessage(error: unknown): string {
  if (isScheduleNotConfiguredError(error)) return SCHEDULE_NOT_CONFIGURED_MESSAGE;
  if (isDayOnLeaveError(error)) return DAY_ON_LEAVE_MESSAGE;
  return error instanceof ApiError ? error.message : FALLBACK_ERROR_MESSAGE;
}
