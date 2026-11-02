import type { PunchType } from './get-punch-action.js';

// Every sentence the attendance screen shows. Labels that come are named here, so no screen
// repeats a literal.
export const ATTENDANCE_PAGE_DESCRIPTION = 'Record your clock-in and clock-out for today.';
export const ATTENDANCE_LOAD_FAILED_MESSAGE = 'Your attendance could not be loaded.';
export const SCHEDULE_NOT_CONFIGURED_MESSAGE =
  'Your work schedule is not set up for today. Contact HR to record attendance.';
// An approved Sick leave or Leave refuses punches on that day. The server's own message is not shown.
export const DAY_ON_LEAVE_MESSAGE =
  'Today is an approved leave, so clocking in or out is not available.';
export const NOT_RECORDED_YET_TEXT = 'Not recorded yet';
export const DAY_OFF_TEXT = 'Day off';
export const SCHEDULED_HOURS_LABEL = 'Scheduled hours';
export const TODAY_SECTION_LABEL = "Today's attendance";
export const CLOCKED_IN_MESSAGE_PREFIX = 'Clocked in at';
export const CLOCKED_OUT_MESSAGE_PREFIX = 'Clocked out at';

// The same words name the primary action and the punch row, so one map serves both.
export const PUNCH_LABEL: Readonly<Record<PunchType, string>> = {
  IN: 'Clock in',
  OUT: 'Clock out',
};
