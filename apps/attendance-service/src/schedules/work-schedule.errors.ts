import { ConflictError, NotFoundError, ValidationError } from '@dexa/common';
import { ErrorCode } from '@dexa/contracts';

/** No schedule version has this id, so there is nothing to edit (PRD SCH-4). */
export class WorkScheduleVersionNotFoundError extends NotFoundError {
  constructor() {
    super(ErrorCode.NOT_FOUND, 'Work schedule version not found.');
  }
}

/**
 * An upcoming version already exists, so a second one would conflict with it. HR edits the upcoming version instead
 * (DATABASE §5.2).
 */
export class UpcomingWorkScheduleExistsError extends ConflictError {
  constructor() {
    super(
      ErrorCode.WORK_SCHEDULE_UPCOMING_EXISTS,
      'An upcoming schedule already exists. Edit it instead of creating another.',
    );
  }
}

/** The version is in effect or in the past, so it is never edited (PRD SCH-4). */
export class WorkScheduleVersionNotUpcomingError extends ConflictError {
  constructor() {
    super(
      ErrorCode.WORK_SCHEDULE_NOT_UPCOMING,
      'Only a schedule that has not taken effect can be changed.',
    );
  }
}

/**
 * The new version would overlap another version. A concurrent change caused it, because the service checks the same
 * rule before writing (DATABASE §5.2, exclusion violation 23P01).
 */
export class WorkScheduleOverlapError extends ConflictError {
  constructor() {
    super(
      ErrorCode.WORK_SCHEDULE_OVERLAP,
      'The schedule changed while it was being saved. Reload the schedule and try again.',
    );
  }
}

/** The effective date is not tomorrow or later in the business timezone (PRD SCH-4). */
export class WorkScheduleEffectiveFromTooEarlyError extends ValidationError {
  constructor() {
    super(
      ErrorCode.WORK_SCHEDULE_EFFECTIVE_FROM_TOO_EARLY,
      'The schedule must take effect tomorrow or later in the business timezone.',
    );
  }
}
