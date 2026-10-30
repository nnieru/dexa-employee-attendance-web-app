import { isExclusionViolation } from '@dexa/common';
import { Inject, Injectable } from '@nestjs/common';
import type { Database } from '@dexa/db';
import { DATABASE } from '../infrastructure/db/database.token.js';
import { workSchedules } from '../infrastructure/db/schema.js';
import type {
  IWorkScheduleRepository,
  NewWorkSchedule,
  ScheduleInsertOutcome,
} from './work-schedule.repository.interface.js';

@Injectable()
export class WorkScheduleRepository implements IWorkScheduleRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async insertIfNoSchedule(schedule: NewWorkSchedule): Promise<ScheduleInsertOutcome> {
    if (await this.hasAnySchedule()) return 'ALREADY_PRESENT';
    try {
      await this.database.db.insert(workSchedules).values({
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
      return 'INSERTED';
    } catch (error: unknown) {
      // Only a concurrent first insert can overlap an open-ended version here, because no version existed
      // when the check ran. The other instance's version is then the seeded schedule, so this is not a failure.
      if (isExclusionViolation(error)) return 'ALREADY_PRESENT';
      throw error;
    }
  }

  private async hasAnySchedule(): Promise<boolean> {
    const rows = await this.database.db
      .select({ id: workSchedules.id })
      .from(workSchedules)
      .limit(1);
    return rows.length > 0;
  }
}
