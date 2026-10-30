import { ConflictError } from '@dexa/common';
import { ErrorCode } from '@dexa/contracts';

/** No schedule version covers the business date, so a punch cannot be classified (ATT-8). */
export class ScheduleNotConfiguredError extends ConflictError {
  constructor() {
    super(
      ErrorCode.SCHEDULE_NOT_CONFIGURED,
      'No work schedule is in effect for this date, so the punch was not recorded.',
    );
  }
}

/** The employee already has an IN punch for this business date (ATT-4). */
export class AttendanceAlreadyClockedInError extends ConflictError {
  constructor() {
    super(ErrorCode.ATTENDANCE_ALREADY_CLOCKED_IN, 'You have already clocked in today.');
  }
}
