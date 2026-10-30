import { ConflictError, ValidationError } from '@dexa/common';
import { ErrorCode } from '@dexa/contracts';
import type { PunchType } from './punch.repository.interface.js';

/**
 * No schedule version covers the business date, so a punch cannot be classified (ATT-8, D-42). Raised before any
 * other check, so nothing is written.
 */
export class ScheduleNotConfiguredError extends ConflictError {
  constructor() {
    super(
      ErrorCode.SCHEDULE_NOT_CONFIGURED,
      'Work schedule not found. The punch was not recorded.',
    );
  }
}

/**
 * No schedule version covers today, so today's state cannot be shown (D-42). The same code as the punch error, with a
 * message that does not mention a punch, because this is a read.
 */
export class TodayScheduleNotConfiguredError extends ConflictError {
  constructor() {
    super(ErrorCode.SCHEDULE_NOT_CONFIGURED, 'Work schedule not found.');
  }
}

/** The employee already has an IN punch for this business date (ATT-4). */
export class AttendanceAlreadyClockedInError extends ConflictError {
  constructor() {
    super(ErrorCode.ATTENDANCE_ALREADY_CLOCKED_IN, 'You have already clocked in today.');
  }
}

/** The employee already has an OUT punch for this business date (ATT-4). */
export class AttendanceAlreadyClockedOutError extends ConflictError {
  constructor() {
    super(ErrorCode.ATTENDANCE_ALREADY_CLOCKED_OUT, 'You have already clocked out today.');
  }
}

/**
 * The employee has no IN punch for this business date, so there is nothing to check out of (ATT-5). A validation
 * error, because the request is refused on its current state and the client can correct it by clocking in first.
 */
export class AttendanceNotClockedInError extends ValidationError {
  constructor() {
    super(
      ErrorCode.ATTENDANCE_NOT_CLOCKED_IN,
      'You have not clocked in today, so there is no clock-out to record.',
    );
  }
}

/**
 * The check-out instant, read after the day was locked, is on another business date or before the day's check-in
 * (D-41). Nothing is stored. The client retries, and the retry is judged against the clock at that time.
 */
export class CheckOutTimeConflictError extends ConflictError {
  constructor() {
    super(
      ErrorCode.CONFLICT,
      'Your clock-out time changed while it was being recorded, so it was not saved. Please try again.',
    );
  }
}

/** The duplicate-punch error for a raw punch type, so the database's one-per-type key maps to the matching code. */
export function duplicatePunchError(type: PunchType): ConflictError {
  return type === 'IN'
    ? new AttendanceAlreadyClockedInError()
    : new AttendanceAlreadyClockedOutError();
}
