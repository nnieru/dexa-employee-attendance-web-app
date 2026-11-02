/**
 * The day statuses that an approved correction writes for a full-day absence. A punch on such a
 * day is refused.
 */
const LEAVE_DAY_STATUS_CODES: ReadonlyArray<string> = ['SICK_LEAVE', 'LEAVE'];

export function isLeaveDay(dayStatusCode: string): boolean {
  return LEAVE_DAY_STATUS_CODES.includes(dayStatusCode);
}
