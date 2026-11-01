import type { IPunchTransaction } from '../punches/punch.repository.interface.js';

/**
 * The day reads and writes that finding or creating a day needs, inside one transaction. The punch transaction
 * provides them, and so will the request transactions, so the schedule snapshot is written in one place.
 */
export type AttendanceDayTransaction = Pick<
  IPunchTransaction,
  'findScheduleInEffect' | 'findCalendarException' | 'insertDayIfMissing' | 'findDayForUpdate'
>;
