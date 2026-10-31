import { DomainError, isExclusionViolation } from '@dexa/common';
import { Inject, Injectable } from '@nestjs/common';
import type { BusinessDate } from '@dexa/common';
import type { WorkScheduleVersion } from '@dexa/contracts';
import type { Database } from '@dexa/db';
import { asc, desc, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import { DATABASE } from '../infrastructure/db/database.token.js';
import { wrapStorageError } from '../infrastructure/db/storage-errors.js';
import { workSchedules, type WorkScheduleRow } from '../infrastructure/db/schema.js';
import { WorkScheduleOverlapError } from './work-schedule.errors.js';
import type {
  IWorkScheduleRepository,
  IWorkScheduleVersionReader,
  IWorkScheduleVersionTransaction,
  IWorkScheduleVersionWriter,
  NewWorkSchedule,
  ScheduleInsertOutcome,
} from './work-schedule.repository.interface.js';

const DEFAULT_SCHEDULE_SEED_LOCK_KEY = 720_416_101;
// The version in effect and the nearest upcoming one are the only two the schedule view needs (DATABASE §5.2).
const SCHEDULE_OVERVIEW_VERSION_LIMIT = 2;

type ScheduleQueryRunner = Pick<Database['db'], 'select' | 'insert'>;
type ScheduleWriteRunner = Pick<Database['db'], 'select' | 'insert' | 'update'>;

@Injectable()
export class WorkScheduleRepository
  implements IWorkScheduleRepository, IWorkScheduleVersionReader, IWorkScheduleVersionWriter
{
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async runInTransaction<TResult>(
    work: (transaction: IWorkScheduleVersionTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    try {
      return await this.database.db.transaction((transaction) =>
        work(createVersionTransactionScope(transaction)),
      );
    } catch (error: unknown) {
      if (error instanceof DomainError) throw error;
      // The exclusion constraint rejects a version that overlaps another one (DATABASE §5.2, 23P01).
      if (isExclusionViolation(error)) throw new WorkScheduleOverlapError();
      throw wrapStorageError(error, 'Could not save the work schedule.');
    }
  }

  // A plain read with no lock. Ordering by effective date puts the version in effect before the upcoming one.
  async findInEffectOrUpcoming(
    businessDate: BusinessDate,
  ): Promise<ReadonlyArray<WorkScheduleVersion>> {
    const rows = await this.database.db
      .select()
      .from(workSchedules)
      .where(
        or(isNull(workSchedules.effectiveUntil), gt(workSchedules.effectiveUntil, businessDate)),
      )
      .orderBy(asc(workSchedules.effectiveFrom))
      .limit(SCHEDULE_OVERVIEW_VERSION_LIMIT);
    return rows.map(toWorkScheduleVersion);
  }

  async insertIfNoSchedule(schedule: NewWorkSchedule): Promise<ScheduleInsertOutcome> {
    try {
      return await this.database.db.transaction(async (transaction) => {
        // Concurrent first inserts on the exclusion constraint can fail as a deadlock instead of 23P01, so
        // instances seeding at the same time are serialized. The lock is released when the transaction ends.
        await transaction.execute(
          sql`select pg_advisory_xact_lock(${DEFAULT_SCHEDULE_SEED_LOCK_KEY})`,
        );
        if (await hasAnySchedule(transaction)) return 'ALREADY_PRESENT';
        await insertOpenEndedSchedule(transaction, schedule);
        return 'INSERTED';
      });
    } catch (error: unknown) {
      // A version written outside the seed lock can still overlap; it is then the schedule in effect.
      if (isExclusionViolation(error)) return 'ALREADY_PRESENT';
      throw error;
    }
  }
}

function createVersionTransactionScope(
  runner: ScheduleWriteRunner,
): IWorkScheduleVersionTransaction {
  return {
    findLatestVersionForUpdate: () => findLatestVersionForUpdate(runner),
    findVersionForUpdate: (versionId) => findVersionForUpdate(runner, versionId),
    findPreviousVersionForUpdate: (effectiveFrom) =>
      findPreviousVersionForUpdate(runner, effectiveFrom),
    setEffectiveUntil: (versionId, effectiveUntil) =>
      setEffectiveUntil(runner, versionId, effectiveUntil),
    insertOpenEndedVersion: (values) => insertOpenEndedVersion(runner, values),
    updateVersion: (versionId, values) => updateVersion(runner, versionId, values),
  };
}

// FOR UPDATE makes a concurrent create or edit of the same version wait until this transaction ends.
async function findLatestVersionForUpdate(
  runner: ScheduleWriteRunner,
): Promise<WorkScheduleVersion | undefined> {
  const [row] = await runner
    .select()
    .from(workSchedules)
    .orderBy(desc(workSchedules.effectiveFrom))
    .limit(1)
    .for('update');
  return row === undefined ? undefined : toWorkScheduleVersion(row);
}

async function findVersionForUpdate(
  runner: ScheduleWriteRunner,
  versionId: string,
): Promise<WorkScheduleVersion | undefined> {
  const [row] = await runner
    .select()
    .from(workSchedules)
    .where(eq(workSchedules.id, versionId))
    .limit(1)
    .for('update');
  return row === undefined ? undefined : toWorkScheduleVersion(row);
}

async function findPreviousVersionForUpdate(
  runner: ScheduleWriteRunner,
  effectiveFrom: BusinessDate,
): Promise<WorkScheduleVersion | undefined> {
  const [row] = await runner
    .select()
    .from(workSchedules)
    .where(lt(workSchedules.effectiveFrom, effectiveFrom))
    .orderBy(desc(workSchedules.effectiveFrom))
    .limit(1)
    .for('update');
  return row === undefined ? undefined : toWorkScheduleVersion(row);
}

async function setEffectiveUntil(
  runner: ScheduleWriteRunner,
  versionId: string,
  effectiveUntil: BusinessDate,
): Promise<void> {
  await runner.update(workSchedules).set({ effectiveUntil }).where(eq(workSchedules.id, versionId));
}

async function insertOpenEndedVersion(
  runner: ScheduleWriteRunner,
  values: NewWorkSchedule,
): Promise<WorkScheduleVersion> {
  const rows = await runner
    .insert(workSchedules)
    .values({ ...toScheduleColumns(values), effectiveUntil: null })
    .returning();
  return toStoredVersion(rows);
}

// effective_until is left alone: a version being edited is upcoming, so it is open-ended and stays that way.
async function updateVersion(
  runner: ScheduleWriteRunner,
  versionId: string,
  values: NewWorkSchedule,
): Promise<WorkScheduleVersion> {
  const rows = await runner
    .update(workSchedules)
    .set(toScheduleColumns(values))
    .where(eq(workSchedules.id, versionId))
    .returning();
  return toStoredVersion(rows);
}

function toStoredVersion(rows: ReadonlyArray<WorkScheduleRow>): WorkScheduleVersion {
  const [row] = rows;
  if (row === undefined)
    throw new Error('The work schedule version was not found after it was locked.');
  return toWorkScheduleVersion(row);
}

// The columns that a version's schedule values set. The end date is not among them: the service sets it on the
// version it supersedes, and a new version is open-ended.
function toScheduleColumns(schedule: NewWorkSchedule) {
  return {
    name: schedule.name,
    timezone: schedule.timezone,
    workingWeekdays: [...schedule.workingWeekdays],
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    lateCheckinGraceMinutes: schedule.lateCheckinGraceMinutes,
    earlyCheckoutGraceMinutes: schedule.earlyCheckoutGraceMinutes,
    lateCheckoutGraceMinutes: schedule.lateCheckoutGraceMinutes,
    effectiveFrom: schedule.effectiveFrom,
  };
}

async function hasAnySchedule(runner: ScheduleQueryRunner): Promise<boolean> {
  const rows = await runner.select({ id: workSchedules.id }).from(workSchedules).limit(1);
  return rows.length > 0;
}

async function insertOpenEndedSchedule(
  runner: ScheduleQueryRunner,
  schedule: NewWorkSchedule,
): Promise<void> {
  await runner
    .insert(workSchedules)
    .values({ ...toScheduleColumns(schedule), effectiveUntil: null });
}

// PostgreSQL returns time as HH:mm:ss, and the contract shows the HH:mm the schedule was entered with.
function toWorkScheduleVersion(row: WorkScheduleRow): WorkScheduleVersion {
  const [startHour, startMinute] = row.startTime.split(':');
  const [endHour, endMinute] = row.endTime.split(':');
  return {
    id: row.id,
    name: row.name,
    timezone: row.timezone,
    workingWeekdays: [...row.workingWeekdays],
    startTime: `${startHour}:${startMinute}`,
    endTime: `${endHour}:${endMinute}`,
    lateCheckinGraceMinutes: row.lateCheckinGraceMinutes,
    earlyCheckoutGraceMinutes: row.earlyCheckoutGraceMinutes,
    lateCheckoutGraceMinutes: row.lateCheckoutGraceMinutes,
    effectiveFrom: row.effectiveFrom,
    effectiveUntil: row.effectiveUntil,
  };
}
