import type { IClock } from '@dexa/common';
import { ClockInService } from './clock-in.service.js';
import { AttendanceAlreadyClockedInError, ScheduleNotConfiguredError } from './punch.errors.js';
import type {
  AttendanceStatusCode,
  DayCheckInUpdate,
  IPunchRepository,
  IPunchTransaction,
  LockedAttendanceDay,
  NewAttendanceDay,
  NewAttendanceEntry,
  ScheduleVersion,
} from './punch.repository.interface.js';
import type {
  CalendarExceptionInput,
  DaySchedule,
} from '../classification/punch-classification.rules.js';

const ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const OTHER_ACCOUNT_ID = '7a1d2e3f-4b5c-4d6e-8f70-1a2b3c4d5e6f';
const SCHEDULE_ID = '0c7d4a52-3f1e-4d8b-9a6c-2b5e7f8a9d01';
const TIMEZONE = 'Asia/Jakarta';
const MONDAY = '2026-11-02';
const TUESDAY = '2026-11-03';

// 09:20 WIB is 02:20 UTC. 23:59 WIB and 00:01 WIB straddle the business-day boundary.
const LATE_MONDAY_INSTANT = new Date('2026-11-02T02:20:00Z');
const EARLY_MONDAY_INSTANT = new Date('2026-11-02T01:30:00Z');
const LAST_MINUTE_MONDAY_INSTANT = new Date('2026-11-02T16:59:00Z');
const FIRST_MINUTE_TUESDAY_INSTANT = new Date('2026-11-02T17:01:00Z');

type FakeSchedule = ScheduleVersion & {
  readonly effectiveFrom: string;
  readonly effectiveUntil: string | null;
};

type FakeDay = {
  readonly id: string;
  readonly accountId: string;
  readonly businessDate: string;
  readonly scheduleVersionId: string;
  readonly daySchedule: DaySchedule;
  readonly dayStatusCode: AttendanceStatusCode;
  checkinStatusCode: AttendanceStatusCode;
  readonly checkoutStatusCode: AttendanceStatusCode;
  effectiveCheckinAt: Date | null;
  revision: number;
};

type FakeState = {
  readonly schedules: ReadonlyArray<FakeSchedule>;
  readonly calendarExceptions: ReadonlyMap<string, CalendarExceptionInput>;
  days: FakeDay[];
  entries: NewAttendanceEntry[];
  nextDayNumber: number;
};

const WEEKDAY_SCHEDULE: FakeSchedule = {
  id: SCHEDULE_ID,
  timezone: TIMEZONE,
  workingWeekdays: [1, 2, 3, 4, 5],
  startTime: '09:00:00',
  endTime: '18:00:00',
  lateCheckinGraceMinutes: 15,
  earlyCheckoutGraceMinutes: 0,
  lateCheckoutGraceMinutes: 0,
  effectiveFrom: MONDAY,
  effectiveUntil: null,
};

// The state stands in for attendance_days, attendance_entries, and the schedule and calendar tables. A transaction
// works on a copy and replaces the state only when its work resolves, so a failed punch leaves nothing behind, as
// PostgreSQL does. An IN entry that already exists is refused the way the real repository refuses it.
class FakePunchRepository implements IPunchRepository {
  state: FakeState;

  constructor(
    schedules: ReadonlyArray<FakeSchedule>,
    calendarExceptions: ReadonlyMap<string, CalendarExceptionInput> = new Map(),
    private readonly failingWrite?: 'updateDayCheckIn',
  ) {
    this.state = { schedules, calendarExceptions, days: [], entries: [], nextDayNumber: 1 };
  }

  async runInTransaction<TResult>(
    work: (transaction: IPunchTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    const working: FakeState = structuredClone(this.state);
    const result = await work(createFakeTransaction(working, this.failingWrite));
    this.state = working;
    return result;
  }
}

function createFakeTransaction(
  state: FakeState,
  failingWrite: 'updateDayCheckIn' | undefined,
): IPunchTransaction {
  return {
    findScheduleInEffect: (businessDate) => {
      const version = state.schedules.find(
        (schedule) =>
          schedule.effectiveFrom <= businessDate &&
          (schedule.effectiveUntil === null || schedule.effectiveUntil > businessDate),
      );
      return Promise.resolve(version);
    },
    findCalendarException: (businessDate) =>
      Promise.resolve(state.calendarExceptions.get(businessDate) ?? null),
    insertDayIfMissing: (day) => {
      const exists = state.days.some(
        (existing) =>
          existing.accountId === day.accountId && existing.businessDate === day.businessDate,
      );
      if (!exists) state.days.push(toFakeDay(state, day));
      return Promise.resolve();
    },
    findDayForUpdate: (accountId, businessDate) => {
      const day = state.days.find(
        (existing) => existing.accountId === accountId && existing.businessDate === businessDate,
      );
      return Promise.resolve(day === undefined ? undefined : toLockedDay(day));
    },
    insertEntry: (entry) => {
      const duplicate = state.entries.some(
        (existing) =>
          existing.attendanceDayId === entry.attendanceDayId && existing.type === entry.type,
      );
      if (duplicate) return Promise.reject(new AttendanceAlreadyClockedInError());
      state.entries.push(entry);
      return Promise.resolve();
    },
    updateDayCheckIn: (update) => {
      if (failingWrite === 'updateDayCheckIn')
        return Promise.reject(new Error('Injected failure.'));
      applyCheckIn(state, update);
      return Promise.resolve();
    },
  };
}

function toFakeDay(state: FakeState, day: NewAttendanceDay): FakeDay {
  state.nextDayNumber += 1;
  const schedule = state.schedules.find((candidate) => candidate.id === day.scheduleVersionId);
  if (schedule === undefined) throw new Error('The fake has no schedule for the day.');
  const daySchedule: DaySchedule = day.isWorkingDay
    ? {
        isWorkingDay: true,
        timezone: day.businessTimezone,
        scheduledStartAt: day.scheduledStartAt ?? new Date(0),
        scheduledEndAt: day.scheduledEndAt ?? new Date(0),
        lateCheckinGraceMinutes: schedule.lateCheckinGraceMinutes,
        earlyCheckoutGraceMinutes: schedule.earlyCheckoutGraceMinutes,
        lateCheckoutGraceMinutes: schedule.lateCheckoutGraceMinutes,
      }
    : {
        isWorkingDay: false,
        timezone: day.businessTimezone,
        scheduledStartAt: null,
        scheduledEndAt: null,
      };
  return {
    id: `day-${state.nextDayNumber}`,
    accountId: day.accountId,
    businessDate: day.businessDate,
    scheduleVersionId: day.scheduleVersionId,
    daySchedule,
    dayStatusCode: day.dayStatusCode,
    checkinStatusCode: day.checkinStatusCode,
    checkoutStatusCode: day.checkoutStatusCode,
    effectiveCheckinAt: null,
    revision: 1,
  };
}

function toLockedDay(day: FakeDay): LockedAttendanceDay {
  return { dayId: day.id, daySchedule: day.daySchedule };
}

function applyCheckIn(state: FakeState, update: DayCheckInUpdate): void {
  const day = state.days.find((existing) => existing.id === update.dayId);
  if (day === undefined) throw new Error('The fake has no such day.');
  day.effectiveCheckinAt = update.effectiveCheckinAt;
  day.checkinStatusCode = update.checkinStatusCode;
  day.revision += 1;
}

function fixedClock(instant: { current: Date }): IClock {
  return { now: () => new Date(instant.current) };
}

function createService(options: {
  readonly repository: FakePunchRepository;
  readonly instant: { current: Date };
}): ClockInService {
  return new ClockInService(options.repository, fixedClock(options.instant), {
    BUSINESS_TIMEZONE: TIMEZONE,
  });
}

describe('ClockInService.clockIn', () => {
  it('should record the server instant and the classified check-in on a new day when the first punch arrives', async () => {
    const instant = { current: LATE_MONDAY_INSTANT };
    const repository = new FakePunchRepository([WEEKDAY_SCHEDULE]);
    const service = createService({ repository, instant });

    const response = await service.clockIn(ACCOUNT_ID);

    expect(response).toEqual({
      type: 'IN',
      recordedAt: '2026-11-02T02:20:00.000Z',
      businessDate: MONDAY,
      classification: 'LATE_CHECKIN',
    });
    expect(repository.state.days).toEqual([
      expect.objectContaining({
        accountId: ACCOUNT_ID,
        businessDate: MONDAY,
        scheduleVersionId: SCHEDULE_ID,
        dayStatusCode: 'PRESENT',
        checkinStatusCode: 'LATE_CHECKIN',
        checkoutStatusCode: 'PENDING_CHECKOUT',
        effectiveCheckinAt: LATE_MONDAY_INSTANT,
        revision: 2,
      }),
    ]);
    expect(repository.state.entries).toEqual([
      {
        attendanceDayId: repository.state.days[0]?.id,
        type: 'IN',
        recordedAt: LATE_MONDAY_INSTANT,
      },
    ]);
  });

  it('should reject a second punch on the same business date and leave the day as the first punch set it', async () => {
    const instant = { current: EARLY_MONDAY_INSTANT };
    const repository = new FakePunchRepository([WEEKDAY_SCHEDULE]);
    const service = createService({ repository, instant });
    await service.clockIn(ACCOUNT_ID);
    const stateAfterFirstPunch = structuredClone(repository.state);

    instant.current = LATE_MONDAY_INSTANT;

    await expect(service.clockIn(ACCOUNT_ID)).rejects.toBeInstanceOf(
      AttendanceAlreadyClockedInError,
    );
    expect(repository.state).toEqual(stateAfterFirstPunch);
  });

  it('should reject the punch and write nothing when no schedule covers the business date', async () => {
    const instant = { current: new Date('2026-11-01T10:00:00Z') };
    const repository = new FakePunchRepository([WEEKDAY_SCHEDULE]);
    const service = createService({ repository, instant });

    await expect(service.clockIn(ACCOUNT_ID)).rejects.toBeInstanceOf(ScheduleNotConfiguredError);
    expect(repository.state.days).toEqual([]);
    expect(repository.state.entries).toEqual([]);
  });

  it('should count a punch at 23:59 WIB and one at 00:01 WIB toward different business dates', async () => {
    const instant = { current: LAST_MINUTE_MONDAY_INSTANT };
    const repository = new FakePunchRepository([WEEKDAY_SCHEDULE]);
    const service = createService({ repository, instant });

    const lastMinute = await service.clockIn(ACCOUNT_ID);
    instant.current = FIRST_MINUTE_TUESDAY_INSTANT;
    const firstMinute = await service.clockIn(ACCOUNT_ID);

    expect(lastMinute.businessDate).toBe(MONDAY);
    expect(firstMinute.businessDate).toBe(TUESDAY);
    expect(repository.state.days.map((day) => day.businessDate)).toEqual([MONDAY, TUESDAY]);
  });

  it('should classify a punch at 09:20 WIB on a working day as late', async () => {
    const instant = { current: LATE_MONDAY_INSTANT };
    const service = createService({
      repository: new FakePunchRepository([WEEKDAY_SCHEDULE]),
      instant,
    });

    await expect(service.clockIn(ACCOUNT_ID)).resolves.toMatchObject({
      classification: 'LATE_CHECKIN',
    });
  });

  it('should classify a punch on a company holiday as not required and start the day with timing not required', async () => {
    const instant = { current: new Date('2026-11-03T02:20:00Z') };
    const holidays = new Map([[TUESDAY, { isWorkingDay: false }]]);
    const repository = new FakePunchRepository([WEEKDAY_SCHEDULE], holidays);
    const service = createService({ repository, instant });

    const response = await service.clockIn(OTHER_ACCOUNT_ID);

    expect(response.classification).toBe('CHECKIN_NOT_REQUIRED');
    expect(repository.state.days[0]).toMatchObject({
      dayStatusCode: 'PRESENT',
      checkinStatusCode: 'CHECKIN_NOT_REQUIRED',
      checkoutStatusCode: 'CHECKOUT_NOT_REQUIRED',
    });
  });

  it('should classify a punch on a weekend as not required when the calendar has no exception', async () => {
    const instant = { current: new Date('2026-11-07T02:20:00Z') };
    const repository = new FakePunchRepository([WEEKDAY_SCHEDULE]);
    const service = createService({ repository, instant });

    await expect(service.clockIn(ACCOUNT_ID)).resolves.toMatchObject({
      businessDate: '2026-11-07',
      classification: 'CHECKIN_NOT_REQUIRED',
    });
  });

  it('should write nothing when the update of the check-in fails after the entry is inserted', async () => {
    const instant = { current: EARLY_MONDAY_INSTANT };
    const repository = new FakePunchRepository([WEEKDAY_SCHEDULE], new Map(), 'updateDayCheckIn');
    const service = createService({ repository, instant });

    await expect(service.clockIn(ACCOUNT_ID)).rejects.toThrow('Injected failure.');
    expect(repository.state.days).toEqual([]);
    expect(repository.state.entries).toEqual([]);
  });
});
