import type { IClock } from '@dexa/common';
import type {
  CalendarExceptionInput,
  DaySchedule,
} from '../src/classification/punch-classification.rules.js';
import { duplicatePunchError } from '../src/punches/punch.errors.js';
import type {
  AttendanceStatusCode,
  DayCheckInUpdate,
  DayCheckOutUpdate,
  IPunchRepository,
  IPunchTransaction,
  LockedAttendanceDay,
  NewAttendanceDay,
  NewAttendanceEntry,
  ScheduleVersion,
} from '../src/punches/punch.repository.interface.js';

export const SCHEDULE_ID = '0c7d4a52-3f1e-4d8b-9a6c-2b5e7f8a9d01';
export const TIMEZONE = 'Asia/Jakarta';
export const MONDAY = '2026-11-02';

export type FakeSchedule = ScheduleVersion & {
  readonly effectiveFrom: string;
  readonly effectiveUntil: string | null;
};

type FakeDay = {
  readonly id: string;
  readonly accountId: string;
  readonly businessDate: string;
  readonly scheduleVersionId: string;
  readonly daySchedule: DaySchedule;
  dayStatusCode: AttendanceStatusCode;
  checkinStatusCode: AttendanceStatusCode;
  checkoutStatusCode: AttendanceStatusCode;
  effectiveCheckinAt: Date | null;
  effectiveCheckoutAt: Date | null;
  revision: number;
};

export type FakeState = {
  readonly schedules: ReadonlyArray<FakeSchedule>;
  readonly calendarExceptions: ReadonlyMap<string, CalendarExceptionInput>;
  days: FakeDay[];
  entries: NewAttendanceEntry[];
  nextDayNumber: number;
};

// A write that the fake fails on purpose, to prove the transaction rolls back the earlier writes.
export type FailingWrite = 'updateDayCheckIn' | 'updateDayCheckOut';

export const WEEKDAY_SCHEDULE: FakeSchedule = {
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
// PostgreSQL does. A duplicate raw punch is refused the way the real repository refuses it.
export class FakePunchRepository implements IPunchRepository {
  state: FakeState;

  constructor(
    schedules: ReadonlyArray<FakeSchedule>,
    calendarExceptions: ReadonlyMap<string, CalendarExceptionInput> = new Map(),
    private readonly failingWrite?: FailingWrite,
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
  failingWrite: FailingWrite | undefined,
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
    hasEntry: (attendanceDayId, type) =>
      Promise.resolve(
        state.entries.some(
          (existing) => existing.attendanceDayId === attendanceDayId && existing.type === type,
        ),
      ),
    insertEntry: (entry) => {
      const duplicate = state.entries.some(
        (existing) =>
          existing.attendanceDayId === entry.attendanceDayId && existing.type === entry.type,
      );
      if (duplicate) return Promise.reject(duplicatePunchError(entry.type));
      state.entries.push(entry);
      return Promise.resolve();
    },
    updateDayCheckIn: (update) => {
      if (failingWrite === 'updateDayCheckIn')
        return Promise.reject(new Error('Injected failure.'));
      applyCheckIn(state, update);
      return Promise.resolve();
    },
    updateDayCheckOut: (update) => {
      if (failingWrite === 'updateDayCheckOut')
        return Promise.reject(new Error('Injected failure.'));
      applyCheckOut(state, update);
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
    effectiveCheckoutAt: null,
    revision: 1,
  };
}

function toLockedDay(day: FakeDay): LockedAttendanceDay {
  return {
    dayId: day.id,
    dayStatusCode: day.dayStatusCode,
    daySchedule: day.daySchedule,
    effectiveCheckinAt: day.effectiveCheckinAt,
  };
}

function findFakeDay(state: FakeState, dayId: string): FakeDay {
  const day = state.days.find((existing) => existing.id === dayId);
  if (day === undefined) throw new Error('The fake has no such day.');
  return day;
}

function applyCheckIn(state: FakeState, update: DayCheckInUpdate): void {
  const day = findFakeDay(state, update.dayId);
  day.effectiveCheckinAt = update.effectiveCheckinAt;
  day.checkinStatusCode = update.checkinStatusCode;
  day.revision += 1;
}

function applyCheckOut(state: FakeState, update: DayCheckOutUpdate): void {
  const day = findFakeDay(state, update.dayId);
  day.effectiveCheckoutAt = update.effectiveCheckoutAt;
  day.checkoutStatusCode = update.checkoutStatusCode;
  day.revision += 1;
}

// Stands in for an approved Sick leave or Leave on the first day of the fake: the status changes
// and the effective times and timing statuses clear, but the raw punches stay.
export function applyApprovedLeave(
  repository: FakePunchRepository,
  dayStatusCode: 'SICK_LEAVE' | 'LEAVE',
): void {
  const day = repository.state.days[0];
  if (day === undefined) throw new Error('The fake has no day to put on leave.');
  day.dayStatusCode = dayStatusCode;
  day.effectiveCheckinAt = null;
  day.effectiveCheckoutAt = null;
  day.checkinStatusCode = 'CHECKIN_NOT_REQUIRED';
  day.checkoutStatusCode = 'CHECKOUT_NOT_REQUIRED';
}

export function fixedClock(instant: { current: Date }): IClock {
  return { now: () => new Date(instant.current) };
}
