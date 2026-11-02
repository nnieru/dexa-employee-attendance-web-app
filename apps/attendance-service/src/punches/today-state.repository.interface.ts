import type { BusinessDate } from '@dexa/common';
import type { CalendarExceptionInput } from '../classification/punch-classification.rules.js';
import type { ScheduleVersion } from './punch.repository.interface.js';

export const TODAY_STATE_READER = Symbol('ITodayStateReader');

/** The schedule fields of a day as the employee may see them: scheduled instants exist only on a working day. */
export type TodayScheduleFields =
  | {
      readonly isWorkingDay: false;
      readonly scheduledStartAt: null;
      readonly scheduledEndAt: null;
    }
  | {
      readonly isWorkingDay: true;
      readonly scheduledStartAt: Date;
      readonly scheduledEndAt: Date;
    };

/**
 * An attendance day as it is stored, read without a lock. The schedule is the day's snapshot, and the effective
 * times and status codes are the ones after any approved correction. The status codes are the
 * master codes as stored; the rules narrow them to the classifications they may hold.
 */
export type TodayDayRecord = {
  readonly schedule: TodayScheduleFields;
  readonly effectiveCheckinAt: Date | null;
  readonly checkinStatusCode: string;
  readonly effectiveCheckoutAt: Date | null;
  readonly checkoutStatusCode: string;
};

/**
 * The reads that today's state needs. It takes no row lock and writes nothing, so it is kept apart from the punch
 * transaction port (interface segregation).
 */
export interface ITodayStateReader {
  /** Resolves undefined when no schedule version covers the business date. */
  findScheduleInEffect(businessDate: BusinessDate): Promise<ScheduleVersion | undefined>;
  /** Resolves null when the company calendar has no exception for the date. */
  findCalendarException(businessDate: BusinessDate): Promise<CalendarExceptionInput | null>;
  /** Resolves undefined when the employee has no attendance day for the business date. */
  findDay(accountId: string, businessDate: BusinessDate): Promise<TodayDayRecord | undefined>;
}
