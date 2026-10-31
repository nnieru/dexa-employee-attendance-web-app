import { isExclusionViolation } from '@dexa/common';
import { Inject, Injectable } from '@nestjs/common';
import type { BusinessDate } from '@dexa/common';
import type { WorkScheduleVersion } from '@dexa/contracts';
import type { Database } from '@dexa/db';
import { asc, gt, isNull, or, sql } from 'drizzle-orm';
import { DATABASE } from '../infrastructure/db/database.token.js';
import { workSchedules, type WorkScheduleRow } from '../infrastructure/db/schema.js';
import type {
  IWorkScheduleRepository,
  IWorkScheduleVersionReader,
  NewWorkSchedule,
  ScheduleInsertOutcome,
} from './work-schedule.repository.interface.js';

const DEFAULT_SCHEDULE_SEED_LOCK_KEY = 720_416_101;
// The version in effect and the nearest upcoming one are the only two the schedule view needs (DATABASE §5.2).
const SCHEDULE_OVERVIEW_VERSION_LIMIT = 2;

type ScheduleQueryRunner = Pick<Database['db'], 'select' | 'insert'>;

@Injectable()
export class WorkScheduleRepository implements IWorkScheduleRepository, IWorkScheduleVersionReader {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

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

async function hasAnySchedule(runner: ScheduleQueryRunner): Promise<boolean> {
  const rows = await runner.select({ id: workSchedules.id }).from(workSchedules).limit(1);
  return rows.length > 0;
}

async function insertOpenEndedSchedule(
  runner: ScheduleQueryRunner,
  schedule: NewWorkSchedule,
): Promise<void> {
  await runner.insert(workSchedules).values({
    name: schedule.name,
    timezone: schedule.timezone,
    workingWeekdays: [...schedule.workingWeekdays],
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    lateCheckinGraceMinutes: schedule.lateCheckinGraceMinutes,
    earlyCheckoutGraceMinutes: schedule.earlyCheckoutGraceMinutes,
    lateCheckoutGraceMinutes: schedule.lateCheckoutGraceMinutes,
    effectiveFrom: schedule.effectiveFrom,
    effectiveUntil: null,
  });
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
