import type { BusinessDate } from '@dexa/common';
import type { WorkScheduleVersion } from '@dexa/contracts';

export const WORK_SCHEDULE_REPOSITORY = Symbol('IWorkScheduleRepository');
export const WORK_SCHEDULE_VERSION_READER = Symbol('IWorkScheduleVersionReader');

export type ScheduleInsertOutcome = 'INSERTED' | 'ALREADY_PRESENT';

// A new company schedule version. Times are local HH:MM in the business timezone (DATABASE §5.2).
export type NewWorkSchedule = {
  readonly name: string;
  readonly timezone: string;
  readonly workingWeekdays: ReadonlyArray<number>;
  readonly startTime: string;
  readonly endTime: string;
  readonly lateCheckinGraceMinutes: number;
  readonly earlyCheckoutGraceMinutes: number;
  readonly lateCheckoutGraceMinutes: number;
  readonly effectiveFrom: string;
};

export interface IWorkScheduleRepository {
  /**
   * Inserts the version only when the table has no schedule yet. Resolves ALREADY_PRESENT when a schedule exists,
   * including when a concurrent instance inserted the first version between the check and the insert.
   */
  insertIfNoSchedule(schedule: NewWorkSchedule): Promise<ScheduleInsertOutcome>;
}

/** Read-only access to the schedule versions that the HR schedule view shows (PRD SCH-3). */
export interface IWorkScheduleVersionReader {
  /**
   * The versions that have not ended by the business date, earliest effective date first, at most two. That is the
   * version in effect (if any) followed by the next upcoming version. The exclusion constraint (DATABASE §5.2) keeps
   * at most one version in effect, so the second row is the nearest upcoming one.
   */
  findInEffectOrUpcoming(businessDate: BusinessDate): Promise<ReadonlyArray<WorkScheduleVersion>>;
}
