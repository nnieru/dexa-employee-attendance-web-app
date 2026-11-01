import type { BusinessDate } from '@dexa/common';
import type {
  CalendarExceptionInput,
  CheckInStatusCode,
  CheckOutStatusCode,
  DaySchedule,
  ScheduleVersionInput,
} from '../classification/punch-classification.rules.js';

export const PUNCH_REPOSITORY = Symbol('IPunchRepository');

/** The company schedule version in effect for a business date (DATABASE §5.2). The id is stored on the day. */
export type ScheduleVersion = ScheduleVersionInput & {
  readonly id: string;
};

/**
 * The day status a new day starts with (DATABASE §5.4). A punch sets PRESENT; a request on a working day starts
 * PENDING and on a day off starts DAY_OFF.
 */
export type DayStatusCode = 'PENDING' | 'PRESENT' | 'DAY_OFF';

/** The check-in status a day starts with, before the first punch classifies it (DATABASE §5.1). */
export type InitialCheckInStatusCode = 'PENDING_CHECKIN' | 'CHECKIN_NOT_REQUIRED';

/** The check-out status a day starts with. A punch never changes it in this task. */
export type InitialCheckOutStatusCode = 'PENDING_CHECKOUT' | 'CHECKOUT_NOT_REQUIRED';

/**
 * Every status code that a punch, a new day, or an approved correction writes. Each one is seeded in
 * master_attendance_statuses (DATABASE §5.1). SICK_LEAVE and LEAVE are written only by an approved correction.
 */
export type AttendanceStatusCode =
  | DayStatusCode
  | 'SICK_LEAVE'
  | 'LEAVE'
  | InitialCheckInStatusCode
  | InitialCheckOutStatusCode
  | CheckInStatusCode
  | CheckOutStatusCode;

/** A new attendance day with its schedule snapshot (DATABASE §5.4). Status codes are resolved to ids on write. */
export type NewAttendanceDay = {
  readonly accountId: string;
  readonly businessDate: BusinessDate;
  readonly scheduleVersionId: string;
  readonly businessTimezone: string;
  readonly isWorkingDay: boolean;
  readonly scheduledStartAt: Date | null;
  readonly scheduledEndAt: Date | null;
  readonly dayStatusCode: DayStatusCode;
  readonly checkinStatusCode: InitialCheckInStatusCode;
  readonly checkoutStatusCode: InitialCheckOutStatusCode;
};

/**
 * The day row after it is locked, with the schedule snapshot that classification reads, the effective check-in
 * that a check-out must not precede (D-41), and the day status that decides whether a punch is refused (COR-7).
 * The effective check-in is null only when the day has no check-in yet. The status is a master code, so it is a
 * string here, as in the summary read.
 */
export type LockedAttendanceDay = {
  readonly dayId: string;
  readonly dayStatusCode: string;
  readonly daySchedule: DaySchedule;
  readonly effectiveCheckinAt: Date | null;
};

/** The stored raw punch types (DATABASE §5.5). */
export type PunchType = 'IN' | 'OUT';

/** A raw punch (DATABASE §5.5). The server instant is the only time it carries. */
export type NewAttendanceEntry = {
  readonly attendanceDayId: string;
  readonly type: PunchType;
  readonly recordedAt: Date;
};

/** The effective check-in that a punch sets, and the classification it receives. */
export type DayCheckInUpdate = {
  readonly dayId: string;
  readonly effectiveCheckinAt: Date;
  readonly checkinStatusCode: CheckInStatusCode;
};

/** The effective check-out that a punch sets, and the classification it receives. */
export type DayCheckOutUpdate = {
  readonly dayId: string;
  readonly effectiveCheckoutAt: Date;
  readonly checkoutStatusCode: CheckOutStatusCode;
};

/**
 * The reads and writes that one punch needs, all inside one transaction. A failed write rejects, and the
 * transaction rolls back, so no part of a punch is kept.
 */
export interface IPunchTransaction {
  /** Resolves undefined when no schedule version covers the business date. */
  findScheduleInEffect(businessDate: BusinessDate): Promise<ScheduleVersion | undefined>;
  /** Resolves null when the company calendar has no exception for the date. */
  findCalendarException(businessDate: BusinessDate): Promise<CalendarExceptionInput | null>;
  /**
   * Inserts the day only when the employee has none for the date. An existing day keeps its snapshot, and a
   * concurrent insert for the same day waits for the other transaction and then does nothing.
   */
  insertDayIfMissing(day: NewAttendanceDay): Promise<void>;
  /** Locks the employee's day row for the rest of the transaction. Resolves undefined when there is no row. */
  findDayForUpdate(
    accountId: string,
    businessDate: BusinessDate,
  ): Promise<LockedAttendanceDay | undefined>;
  /** True when the day already has a raw punch of this type. */
  hasEntry(attendanceDayId: string, type: PunchType): Promise<boolean>;
  /**
   * Rejects with the duplicate error for the entry's type (AttendanceAlreadyClockedInError or
   * AttendanceAlreadyClockedOutError) when the day already has one. Any other failure keeps its own error.
   */
  insertEntry(entry: NewAttendanceEntry): Promise<void>;
  /** Sets the effective check-in and its classification, and increments the day's revision. */
  updateDayCheckIn(update: DayCheckInUpdate): Promise<void>;
  /** Sets the effective check-out and its classification, and increments the day's revision. */
  updateDayCheckOut(update: DayCheckOutUpdate): Promise<void>;
}

export interface IPunchRepository {
  /**
   * Runs the work in one transaction. A DomainError raised by the work rolls the transaction back and reaches the
   * caller unchanged. Any other failure is reported without its SQL or bind values.
   */
  runInTransaction<TResult>(
    work: (transaction: IPunchTransaction) => Promise<TResult>,
  ): Promise<TResult>;
}
