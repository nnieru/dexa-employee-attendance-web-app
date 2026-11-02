import { ConflictError, NotFoundError } from '@dexa/common';
import { ErrorCode } from '@dexa/contracts';

/** No calendar exception has this date, so there is nothing to delete. */
export class WorkCalendarDateNotFoundError extends NotFoundError {
  constructor() {
    super(ErrorCode.NOT_FOUND, 'Calendar date not found.');
  }
}

/**
 * The date is today or earlier in the business timezone. Such a date is read-only, so attendance already recorded
 * on it cannot change.
 */
export class WorkCalendarDateNotFutureError extends ConflictError {
  constructor() {
    super(
      ErrorCode.WORK_CALENDAR_DATE_NOT_FUTURE,
      'Calendar dates can only be changed for dates after today in the business timezone.',
    );
  }
}
