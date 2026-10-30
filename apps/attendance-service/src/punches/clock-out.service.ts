import { CLOCK, toBusinessDate, type BusinessDate, type IClock } from '@dexa/common';
import type { CheckOutClassification, ClockOutResponse } from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { CONFIG } from '../config/config.token.js';
import type { AttendanceServiceConfig } from '../config/attendance-service-config.schema.js';
import { classifyCheckOut } from '../classification/punch-classification.rules.js';
import type { IClockOutService } from './clock-out.service.interface.js';
import {
  AttendanceAlreadyClockedOutError,
  AttendanceNotClockedInError,
  CheckOutTimeConflictError,
} from './punch.errors.js';
import {
  PUNCH_REPOSITORY,
  type IPunchRepository,
  type IPunchTransaction,
  type LockedAttendanceDay,
} from './punch.repository.interface.js';

type CheckOutTarget = {
  readonly accountId: string;
  readonly businessDate: BusinessDate;
};

type CheckOutContext = {
  readonly clock: IClock;
  readonly timeZone: string;
};

type CheckOutRecording = {
  readonly recordedAt: Date;
  readonly classification: CheckOutClassification;
};

@Injectable()
export class ClockOutService implements IClockOutService {
  constructor(
    @Inject(PUNCH_REPOSITORY) private readonly punches: IPunchRepository,
    @Inject(CLOCK) private readonly clock: IClock,
    @Inject(CONFIG) private readonly config: Pick<AttendanceServiceConfig, 'BUSINESS_TIMEZONE'>,
  ) {}

  // The first read only selects the day row to lock, by its business date. The stored instant is a second read taken
  // after the lock is held (D-41), so a clock-in that committed during the lock wait is ordered before this check-out.
  // This replaces the single-read rule of DATABASE §5.5 for check-out only.
  async clockOut(accountId: string): Promise<ClockOutResponse> {
    const lookupInstant = this.clock.now();
    const businessDate = toBusinessDate(lookupInstant, this.config.BUSINESS_TIMEZONE);
    const recording = await this.punches.runInTransaction((transaction) =>
      recordCheckOut(
        transaction,
        { accountId, businessDate },
        { clock: this.clock, timeZone: this.config.BUSINESS_TIMEZONE },
      ),
    );
    return {
      type: 'OUT',
      recordedAt: recording.recordedAt.toISOString(),
      businessDate,
      classification: recording.classification,
    };
  }
}

async function recordCheckOut(
  transaction: IPunchTransaction,
  target: CheckOutTarget,
  context: CheckOutContext,
): Promise<CheckOutRecording> {
  const { accountId, businessDate } = target;
  // The row lock serializes competing check-outs. A second one waits, and then, in a new statement snapshot, sees the
  // OUT entry that the first one saved.
  const day = await transaction.findDayForUpdate(accountId, businessDate);
  if (day === undefined) throw new AttendanceNotClockedInError();
  await assertCanCheckOut(transaction, day);

  const recordedAt = context.clock.now();
  assertRecordableInstant({
    recordedAt,
    businessDate,
    effectiveCheckinAt: day.effectiveCheckinAt,
    timeZone: context.timeZone,
  });

  // The classification uses the day's stored snapshot, not the schedule in effect now (PRD SCH-6).
  const classification = classifyCheckOut(recordedAt, day.daySchedule);
  await transaction.insertEntry({ attendanceDayId: day.dayId, type: 'OUT', recordedAt });
  await transaction.updateDayCheckOut({
    dayId: day.dayId,
    effectiveCheckoutAt: recordedAt,
    checkoutStatusCode: classification,
  });
  return { recordedAt, classification };
}

async function assertCanCheckOut(
  transaction: IPunchTransaction,
  day: LockedAttendanceDay,
): Promise<void> {
  if (!(await transaction.hasEntry(day.dayId, 'IN'))) throw new AttendanceNotClockedInError();
  if (await transaction.hasEntry(day.dayId, 'OUT')) throw new AttendanceAlreadyClockedOutError();
}

// D-41: the locked day's business date and its check-in bound the instant. Midnight can pass while the request waits
// for the lock, and replicas can disagree about the clock, so an instant outside those bounds would be stored against
// the wrong day or violate attendance_days_effective_checkout_ck. The check-out is refused as a retryable conflict.
function assertRecordableInstant(input: {
  readonly recordedAt: Date;
  readonly businessDate: BusinessDate;
  readonly effectiveCheckinAt: Date | null;
  readonly timeZone: string;
}): void {
  const { recordedAt, businessDate, effectiveCheckinAt, timeZone } = input;
  // A day with a raw check-in always has its effective check-in set in v1, so null means a broken row.
  if (effectiveCheckinAt === null) {
    throw new Error('The attendance day has a check-in but no effective check-in time.');
  }
  const isOnBusinessDate = toBusinessDate(recordedAt, timeZone) === businessDate;
  const isAtOrAfterCheckIn = recordedAt.getTime() >= effectiveCheckinAt.getTime();
  if (!isOnBusinessDate || !isAtOrAfterCheckIn) throw new CheckOutTimeConflictError();
}
