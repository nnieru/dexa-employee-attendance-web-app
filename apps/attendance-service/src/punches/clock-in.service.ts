import { CLOCK, toBusinessDate, type BusinessDate, type IClock } from '@dexa/common';
import type { CheckInClassification, ClockInResponse } from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { CONFIG } from '../config/config.token.js';
import type { AttendanceServiceConfig } from '../config/attendance-service-config.schema.js';
import {
  classifyCheckIn,
  resolveDaySchedule,
} from '../classification/punch-classification.rules.js';
import { buildNewAttendanceDay } from './clock-in.rules.js';
import type { IClockInService } from './clock-in.service.interface.js';
import { ScheduleNotConfiguredError } from './punch.errors.js';
import {
  PUNCH_REPOSITORY,
  type IPunchRepository,
  type IPunchTransaction,
} from './punch.repository.interface.js';

type ClockInMoment = {
  readonly accountId: string;
  readonly businessDate: BusinessDate;
  readonly recordedAt: Date;
};

@Injectable()
export class ClockInService implements IClockInService {
  constructor(
    @Inject(PUNCH_REPOSITORY) private readonly punches: IPunchRepository,
    @Inject(CLOCK) private readonly clock: IClock,
    @Inject(CONFIG) private readonly config: Pick<AttendanceServiceConfig, 'BUSINESS_TIMEZONE'>,
  ) {}

  // The instant is read once, so the stored punch, the business date, and the classification all come from the same
  // moment (DATABASE §5.5).
  async clockIn(accountId: string): Promise<ClockInResponse> {
    const recordedAt = this.clock.now();
    const businessDate = toBusinessDate(recordedAt, this.config.BUSINESS_TIMEZONE);
    const classification = await this.punches.runInTransaction((transaction) =>
      recordCheckIn(transaction, { accountId, businessDate, recordedAt }),
    );
    return {
      type: 'IN',
      recordedAt: recordedAt.toISOString(),
      businessDate,
      classification,
    };
  }
}

async function recordCheckIn(
  transaction: IPunchTransaction,
  moment: ClockInMoment,
): Promise<CheckInClassification> {
  const { accountId, businessDate, recordedAt } = moment;
  const scheduleVersion = await transaction.findScheduleInEffect(businessDate);
  if (scheduleVersion === undefined) throw new ScheduleNotConfiguredError();

  const calendarException = await transaction.findCalendarException(businessDate);
  const daySchedule = resolveDaySchedule({ businessDate, scheduleVersion, calendarException });
  // Concurrent first punches are serialized here: the insert waits for a competing insert, and the lock below keeps
  // a second punch from writing until this one commits.
  await transaction.insertDayIfMissing(
    buildNewAttendanceDay({ accountId, businessDate, scheduleVersion, daySchedule }),
  );
  const day = await transaction.findDayForUpdate(accountId, businessDate);
  if (day === undefined) throw new Error('The attendance day was not found after it was inserted.');

  // The classification uses the day's stored snapshot, not the schedule in effect now (PRD SCH-6).
  const classification = classifyCheckIn(recordedAt, day.daySchedule);
  await transaction.insertEntry({ attendanceDayId: day.dayId, type: 'IN', recordedAt });
  await transaction.updateDayCheckIn({
    dayId: day.dayId,
    effectiveCheckinAt: recordedAt,
    checkinStatusCode: classification,
  });
  return classification;
}
