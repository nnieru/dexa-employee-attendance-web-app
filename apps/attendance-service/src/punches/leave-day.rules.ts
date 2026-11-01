/**
 * The day statuses that an approved correction writes for a full-day absence (DATABASE §5.4, §5.8). A punch on such a
 * day is refused (PRD COR-7).
 */
const LEAVE_DAY_STATUS_CODES: ReadonlyArray<string> = ['SICK_LEAVE', 'LEAVE'];

export function isLeaveDay(dayStatusCode: string): boolean {
  return LEAVE_DAY_STATUS_CODES.includes(dayStatusCode);
}
