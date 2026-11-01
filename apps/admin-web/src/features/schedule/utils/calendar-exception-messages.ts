import { ApiError, FALLBACK_ERROR_MESSAGE } from '@dexa/api-client';

export const CALENDAR_SECTION_TITLE = 'Calendar exceptions';
export const CALENDAR_SECTION_DESCRIPTION =
  'Holidays on regular working days, and special working days on regular days off. Only dates after today (WIB) can be added, changed, or removed. Attendance already recorded is not reclassified.';
export const CALENDAR_TABLE_CAPTION = 'Calendar exceptions in the selected range';
export const CALENDAR_LOAD_ERROR_MESSAGE = 'Calendar exceptions could not be loaded. Try again.';
export const INVALID_RANGE_TABLE_MESSAGE = 'Choose a valid date range to see calendar exceptions.';
export const RETRY_LABEL = 'Try again';
export const ADD_EXCEPTION_LABEL = 'Add exception';
export const NO_DESCRIPTION_TEXT = '—';

export const EDIT_EXCEPTION_LABEL_PREFIX = 'Edit exception';
export const REMOVE_EXCEPTION_LABEL_PREFIX = 'Remove exception';

export const ADD_DIALOG_TITLE = 'Add calendar exception';
export const ADD_DIALOG_DESCRIPTION =
  'Mark a future working day as a holiday, or a future day off as a special working day.';
export const EDIT_DIALOG_TITLE = 'Edit calendar exception';
export const EDIT_DIALOG_DESCRIPTION = 'Change the type or description. The date stays the same.';
export const ADD_SUBMIT_LABEL = 'Add exception';
export const EDIT_SUBMIT_LABEL = 'Save changes';
export const DATE_LABEL = 'Date';
export const DATE_HINT = 'Tomorrow (WIB) or later.';
export const DATE_REPLACE_HINT = 'Saving replaces an exception already set for this date.';
export const EXCEPTION_TYPE_LEGEND = 'Exception type';
export const HOLIDAY_HELP = 'No attendance required on a regular working day.';
export const SPECIAL_WORKING_DAY_HELP = 'Attendance required on a regular day off.';
export const DESCRIPTION_LABEL = 'Description (optional)';
export const SAVE_NOT_PREPARED_MESSAGE =
  'The calendar exception could not be prepared. Check the fields and try again.';
export const CANCEL_LABEL = 'Cancel';

export const REMOVE_DIALOG_TITLE = 'Remove calendar exception?';
export const REMOVE_DIALOG_CONFIRM_LABEL = 'Remove exception';

export const SAVE_SUCCESS_MESSAGE = 'Calendar exception saved.';
export const REMOVE_SUCCESS_MESSAGE = 'Calendar exception removed.';

/** Names the range, so HR can tell an empty result from a range that is too narrow (DESIGN §9). */
export function getCalendarExceptionEmptyMessage(range: { from: string; to: string }): string {
  return `No calendar exceptions from ${range.from} to ${range.to}.`;
}

export function getRemoveDialogDescription(date: string): string {
  return `${date} will follow the regular schedule again.`;
}

/** ApiError messages are user-safe by design. Anything else is shown as the generic fallback. */
export function getCalendarExceptionErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : FALLBACK_ERROR_MESSAGE;
}
