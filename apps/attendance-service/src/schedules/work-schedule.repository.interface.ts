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

export const WORK_SCHEDULE_VERSION_WRITER = Symbol('IWorkScheduleVersionWriter');

/**
 * Writes schedule versions inside one transaction. The service decides what to write; the transaction scope only
 * reads and writes rows. The find methods lock their rows, so a concurrent create or edit waits for this one.
 */
export interface IWorkScheduleVersionWriter {
  runInTransaction<TResult>(
    work: (transaction: IWorkScheduleVersionTransaction) => Promise<TResult>,
  ): Promise<TResult>;
}

export interface IWorkScheduleVersionTransaction {
  /** The version with the latest effective date, or undefined when the table is empty. */
  findLatestVersionForUpdate(): Promise<WorkScheduleVersion | undefined>;
  findVersionForUpdate(versionId: string): Promise<WorkScheduleVersion | undefined>;
  /** The nearest version that starts before the given date, or undefined when there is none. */
  findPreviousVersionForUpdate(
    effectiveFrom: BusinessDate,
  ): Promise<WorkScheduleVersion | undefined>;
  setEffectiveUntil(versionId: string, effectiveUntil: BusinessDate): Promise<void>;
  /** Inserts a version with no end. Returns the stored version. */
  insertOpenEndedVersion(values: NewWorkSchedule): Promise<WorkScheduleVersion>;
  /** Replaces the values of a version and keeps its id. Returns the stored version. */
  updateVersion(versionId: string, values: NewWorkSchedule): Promise<WorkScheduleVersion>;
}
