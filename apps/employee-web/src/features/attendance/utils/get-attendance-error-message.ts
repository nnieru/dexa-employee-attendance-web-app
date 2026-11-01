import { ApiError, FALLBACK_ERROR_MESSAGE } from '@dexa/api-client';
import { ErrorCode } from '@dexa/contracts';
import { SCHEDULE_NOT_CONFIGURED_MESSAGE } from './attendance-copy.js';

/** True when no work schedule covers the day, so attendance cannot be recorded or shown (ATT-8, D-42). */
export function isScheduleNotConfiguredError(error: unknown): boolean {
  return error instanceof ApiError && error.code === ErrorCode.SCHEDULE_NOT_CONFIGURED;
}

/** The message for a failed punch. ApiError messages are user-safe; anything else gets the generic fallback. */
export function getAttendanceErrorMessage(error: unknown): string {
  if (isScheduleNotConfiguredError(error)) return SCHEDULE_NOT_CONFIGURED_MESSAGE;
  return error instanceof ApiError ? error.message : FALLBACK_ERROR_MESSAGE;
}
