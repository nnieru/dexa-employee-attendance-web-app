import { isExclusionViolation } from '@dexa/common';
import { Inject, Injectable } from '@nestjs/common';
import type { Database } from '@dexa/db';
import { sql } from 'drizzle-orm';
import { DATABASE } from '../infrastructure/db/database.token.js';
import { workSchedules } from '../infrastructure/db/schema.js';
import type {
  IWorkScheduleRepository,
  NewWorkSchedule,
  ScheduleInsertOutcome,
} from './work-schedule.repository.interface.js';

const DEFAULT_SCHEDULE_SEED_LOCK_KEY = 720_416_101;

type ScheduleQueryRunner = Pick<Database['db'], 'select' | 'insert'>;

@Injectable()
export class WorkScheduleRepository implements IWorkScheduleRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

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
