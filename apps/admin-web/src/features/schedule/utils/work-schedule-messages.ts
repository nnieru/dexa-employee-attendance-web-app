import { ApiError, FALLBACK_ERROR_MESSAGE } from '@dexa/api-client';

export const WORK_SCHEDULE_PAGE_TITLE = 'Work schedule';
export const WORK_SCHEDULE_PAGE_DESCRIPTION =
  'One company schedule classifies clock-ins and clock-outs. Times are in WIB. Changes apply from a future date and never reclassify past days.';
export const WORK_SCHEDULE_LOADING_TEXT = 'Loading work schedule.';
export const WORK_SCHEDULE_LOAD_ERROR_MESSAGE = 'The work schedule could not be loaded. Try again.';
export const RETRY_LABEL = 'Try again';

export const NO_SCHEDULE_TITLE = 'No work schedule is configured.';
export const NO_SCHEDULE_TEXT = 'Save the first version below.';

export const CURRENT_HEADING = 'Current schedule';
export const CURRENT_STATUS_LABEL = 'In effect';
export const CURRENT_NOTE = 'Versions in effect are never edited, only superseded.';
export const NO_CURRENT_TEXT =
  'No schedule version covers today. Clock-ins and clock-outs are refused until one does.';

export const UPCOMING_HEADING = 'Upcoming version';
export const UPCOMING_NOTE = 'Can be changed until it takes effect.';
export const NO_UPCOMING_TEXT =
  'No upcoming version. The current schedule stays in effect until you save a new version.';

export const NEW_VERSION_HEADING = 'New version';
export const NEW_VERSION_DESCRIPTION =
  'Applies from the effective date. Days already recorded keep the schedule they were classified with.';
export const EDIT_VERSION_HEADING = 'Edit upcoming version';
export const EDIT_VERSION_DESCRIPTION =
  'Changes apply from the effective date. The version in effect ends the day before that date.';
export const NEW_VERSION_SUBMIT_LABEL = 'Save new version';
export const EDIT_VERSION_SUBMIT_LABEL = 'Save changes';

export const WORKING_DAYS_LEGEND = 'Working days';
export const START_TIME_LABEL = 'Start time (WIB)';
export const END_TIME_LABEL = 'End time (WIB)';
export const LATE_CHECKIN_GRACE_LABEL = 'Late clock-in grace (minutes)';
export const EARLY_CHECKOUT_GRACE_LABEL = 'Early clock-out grace (minutes)';
export const LATE_CHECKOUT_GRACE_LABEL = 'Late clock-out grace (minutes)';
export const LATE_CHECKIN_GRACE_HINT =
  'Clock-in up to this many minutes after the start is still on time.';
export const EARLY_CHECKOUT_GRACE_HINT =
  'Clock-out up to this many minutes before the end is still on time.';
export const LATE_CHECKOUT_GRACE_HINT =
  'Clock-out up to this many minutes after the end is still on time.';
export const EFFECTIVE_FROM_LABEL = 'Effective from (WIB)';
export const EFFECTIVE_FROM_HINT =
  'Tomorrow or later. The version in effect ends the day before this date.';

export const SAVE_DIALOG_TITLE = 'Save work schedule?';
export const SAVE_DIALOG_CONFIRM_LABEL = 'Save schedule';

/** Names the effective date, and says recorded days keep their classification (SCH-6). */
export function getSaveDialogDescription(effectiveFrom: string): string {
  return `Punches from ${effectiveFrom} are classified with this schedule. Attendance already recorded is not reclassified.`;
}

export const WORK_SCHEDULE_SAVED_MESSAGE = 'Work schedule saved.';

export const CONFLICT_MESSAGE =
  'The work schedule changed while you were editing. The latest schedule is shown now. Review it before saving again.';

/** Open-ended versions have no effective until date (SCH-3). */
export const OPEN_ENDED_TEXT = 'Open-ended';
export const EFFECTIVE_UNTIL_EXCLUSIVE_HINT = 'The last day is the day before this date.';

/** A save was refused because the schedule changed underneath it (DATABASE §5.2: 409 for a second upcoming version or an overlap). */
export function isWorkScheduleConflictError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}

/** The message for a failed save that is not a conflict. ApiError messages are user-safe by design. */
export function getWorkScheduleSaveErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : FALLBACK_ERROR_MESSAGE;
}
