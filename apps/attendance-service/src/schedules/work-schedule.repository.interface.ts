export const WORK_SCHEDULE_REPOSITORY = Symbol('IWorkScheduleRepository');

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
