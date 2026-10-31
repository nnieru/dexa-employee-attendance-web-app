import { getMonthStart, ValidationError, type BusinessDate } from '@dexa/common';
import { ErrorCode, isSummaryRangeOrdered } from '@dexa/contracts';

export type AttendanceRange = {
  /** Both ends are inclusive business dates. */
  readonly from: BusinessDate;
  readonly to: BusinessDate;
};

/**
 * Fills a missing bound with the default range, the first day of today's business month through today (PRD SUM-1,
 * D-17). The range is checked again after filling, because a single bound given by the client can fall out of order
 * with its default.
 */
export function resolveAttendanceRange(
  requested: { readonly from?: BusinessDate; readonly to?: BusinessDate },
  today: BusinessDate,
): AttendanceRange {
  const from = requested.from ?? getMonthStart(today);
  const to = requested.to ?? today;
  if (!isSummaryRangeOrdered(from, to)) {
    throw new ValidationError(ErrorCode.VALIDATION_FAILED, 'from: must not be after to');
  }
  return { from, to };
}
