import type { IClock } from '@dexa/common';
import { ClockInService } from './clock-in.service.js';
import { ClockOutService } from './clock-out.service.js';
import {
  AttendanceAlreadyClockedOutError,
  AttendanceNotClockedInError,
  CheckOutTimeConflictError,
} from './punch.errors.js';
import {
  FakePunchRepository,
  MONDAY,
  SCHEDULE_ID,
  TIMEZONE,
  WEEKDAY_SCHEDULE,
  fixedClock,
  type FakeSchedule,
} from '../../test/fake-punch-repository.js';

const ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const TUESDAY = '2026-11-03';
const SATURDAY = '2026-11-07';
const SUCCESSOR_SCHEDULE_ID = '3b9e6d10-2c4f-4a7b-8e5d-6f1a2b3c4d5e';

// 09:00 WIB is 02:00 UTC and 18:00 WIB is 11:00 UTC. 08:30 WIB is an early check-in.
const EARLY_MONDAY_CHECKIN_INSTANT = new Date('2026-11-02T01:30:00Z');
const ON_TIME_MONDAY_CHECKOUT_INSTANT = new Date('2026-11-02T11:00:00Z');
const LATE_MONDAY_CHECKOUT_INSTANT = new Date('2026-11-02T11:30:00Z');

// A schedule version that replaces WEEKDAY_SCHEDULE from Tuesday on: it ends at 17:00 WIB instead of 18:00 WIB.
const SUCCESSOR_SCHEDULE: FakeSchedule = {
  ...WEEKDAY_SCHEDULE,
  id: SUCCESSOR_SCHEDULE_ID,
  endTime: '17:00:00',
  effectiveFrom: TUESDAY,
  effectiveUntil: null,
};

// Both services read the same instant, as they do in the application, so a test moves the clock in one place.
function createServices(repository: FakePunchRepository, instant: { current: Date }) {
  const clock = fixedClock(instant);
  const config = { BUSINESS_TIMEZONE: TIMEZONE };
  return {
    clockIn: new ClockInService(repository, clock, config),
    clockOut: new ClockOutService(repository, clock, config),
  };
}

describe('ClockOutService.clockOut', () => {
  it('should record the server instant and the on-time check-out on the day when the employee clocks out at the scheduled end', async () => {
    const instant = { current: EARLY_MONDAY_CHECKIN_INSTANT };
    const repository = new FakePunchRepository([WEEKDAY_SCHEDULE]);
    const services = createServices(repository, instant);
    await services.clockIn.clockIn(ACCOUNT_ID);

    instant.current = ON_TIME_MONDAY_CHECKOUT_INSTANT;
    const response = await services.clockOut.clockOut(ACCOUNT_ID);

    expect(response).toEqual({
      type: 'OUT',
      recordedAt: '2026-11-02T11:00:00.000Z',
      businessDate: MONDAY,
      classification: 'ON_TIME_CHECKOUT',
    });
    expect(repository.state.days).toEqual([
      expect.objectContaining({
        accountId: ACCOUNT_ID,
        businessDate: MONDAY,
        dayStatusCode: 'PRESENT',
        checkoutStatusCode: 'ON_TIME_CHECKOUT',
        effectiveCheckoutAt: ON_TIME_MONDAY_CHECKOUT_INSTANT,
        revision: 3,
      }),
    ]);
    expect(repository.state.entries).toContainEqual({
      attendanceDayId: repository.state.days[0]?.id,
      type: 'OUT',
      recordedAt: ON_TIME_MONDAY_CHECKOUT_INSTANT,
    });
  });

  it.each([
    {
      condition: 'the check-out is one minute before the scheduled end',
      instant: '2026-11-02T10:59:00Z',
      classification: 'EARLY_CHECKOUT',
    },
    {
      condition: 'the check-out is at the scheduled end',
      instant: '2026-11-02T11:00:00Z',
      classification: 'ON_TIME_CHECKOUT',
    },
    {
      condition: 'the check-out is 59 seconds after the scheduled end',
      instant: '2026-11-02T11:00:59Z',
      classification: 'ON_TIME_CHECKOUT',
    },
    {
      condition: 'the check-out is one minute after the scheduled end',
      instant: '2026-11-02T11:01:00Z',
      classification: 'LATE_CHECKOUT',
    },
  ])(
    'should classify the check-out as $classification when $condition',
    async ({ instant: checkOutInstant, classification }) => {
      const instant = { current: EARLY_MONDAY_CHECKIN_INSTANT };
      const services = createServices(new FakePunchRepository([WEEKDAY_SCHEDULE]), instant);
      await services.clockIn.clockIn(ACCOUNT_ID);

      instant.current = new Date(checkOutInstant);

      await expect(services.clockOut.clockOut(ACCOUNT_ID)).resolves.toMatchObject({
        classification,
      });
    },
  );

  it('should classify the check-out as not required and keep the day off when the business date is a day off', async () => {
    const instant = { current: new Date('2026-11-07T02:20:00Z') };
    const repository = new FakePunchRepository([WEEKDAY_SCHEDULE]);
    const services = createServices(repository, instant);
    await services.clockIn.clockIn(ACCOUNT_ID);

    instant.current = new Date('2026-11-07T11:00:00Z');
    const response = await services.clockOut.clockOut(ACCOUNT_ID);

    expect(response).toMatchObject({
      businessDate: SATURDAY,
      classification: 'CHECKOUT_NOT_REQUIRED',
    });
    expect(repository.state.days[0]).toMatchObject({
      checkoutStatusCode: 'CHECKOUT_NOT_REQUIRED',
      effectiveCheckoutAt: new Date('2026-11-07T11:00:00Z'),
    });
  });

  it('should reject the check-out and write nothing when the employee has no attendance day for the business date', async () => {
    const instant = { current: ON_TIME_MONDAY_CHECKOUT_INSTANT };
    const repository = new FakePunchRepository([WEEKDAY_SCHEDULE]);
    const services = createServices(repository, instant);

    await expect(services.clockOut.clockOut(ACCOUNT_ID)).rejects.toBeInstanceOf(
      AttendanceNotClockedInError,
    );
    expect(repository.state.days).toEqual([]);
    expect(repository.state.entries).toEqual([]);
  });

  it('should reject the check-out and write nothing when the day exists but has no check-in', async () => {
    const instant = { current: ON_TIME_MONDAY_CHECKOUT_INSTANT };
    const repository = new FakePunchRepository([WEEKDAY_SCHEDULE]);
    await repository.runInTransaction((transaction) =>
      transaction.insertDayIfMissing({
        accountId: ACCOUNT_ID,
        businessDate: MONDAY,
        scheduleVersionId: SCHEDULE_ID,
        businessTimezone: TIMEZONE,
        isWorkingDay: true,
        scheduledStartAt: new Date('2026-11-02T02:00:00Z'),
        scheduledEndAt: ON_TIME_MONDAY_CHECKOUT_INSTANT,
        dayStatusCode: 'PRESENT',
        checkinStatusCode: 'PENDING_CHECKIN',
        checkoutStatusCode: 'PENDING_CHECKOUT',
      }),
    );
    const stateBeforeCheckOut = structuredClone(repository.state);
    const services = createServices(repository, instant);

    await expect(services.clockOut.clockOut(ACCOUNT_ID)).rejects.toBeInstanceOf(
      AttendanceNotClockedInError,
    );
    expect(repository.state).toEqual(stateBeforeCheckOut);
  });

  it('should reject the second check-out and keep the first one when the employee clocks out again the same day', async () => {
    const instant = { current: EARLY_MONDAY_CHECKIN_INSTANT };
    const repository = new FakePunchRepository([WEEKDAY_SCHEDULE]);
    const services = createServices(repository, instant);
    await services.clockIn.clockIn(ACCOUNT_ID);
    instant.current = ON_TIME_MONDAY_CHECKOUT_INSTANT;
    await services.clockOut.clockOut(ACCOUNT_ID);
    const stateAfterFirstCheckOut = structuredClone(repository.state);

    instant.current = LATE_MONDAY_CHECKOUT_INSTANT;

    await expect(services.clockOut.clockOut(ACCOUNT_ID)).rejects.toBeInstanceOf(
      AttendanceAlreadyClockedOutError,
    );
    expect(repository.state).toEqual(stateAfterFirstCheckOut);
  });

  it('should classify with the day snapshot when the schedule in effect changes later the same day', async () => {
    const instant = { current: new Date('2026-11-03T01:00:00Z') };
    const repository = new FakePunchRepository([WEEKDAY_SCHEDULE]);
    const services = createServices(repository, instant);
    await services.clockIn.clockIn(ACCOUNT_ID);

    // The weekday version is superseded at the start of Tuesday, so the successor is in effect for the rest of the day.
    const supersededSchedule: FakeSchedule = { ...WEEKDAY_SCHEDULE, effectiveUntil: TUESDAY };
    repository.state = {
      ...repository.state,
      schedules: [supersededSchedule, SUCCESSOR_SCHEDULE],
    };
    const inEffect = await repository.runInTransaction((transaction) =>
      transaction.findScheduleInEffect(TUESDAY),
    );
    expect(inEffect?.id).toBe(SUCCESSOR_SCHEDULE_ID);

    // 17:30 WIB: early under the snapshot's 18:00 end, late under the successor's 17:00 end.
    instant.current = new Date('2026-11-03T10:30:00Z');
    await expect(services.clockOut.clockOut(ACCOUNT_ID)).resolves.toMatchObject({
      businessDate: TUESDAY,
      classification: 'EARLY_CHECKOUT',
    });
  });

  it('should write nothing when the update of the check-out fails after the entry is inserted', async () => {
    const instant = { current: EARLY_MONDAY_CHECKIN_INSTANT };
    const repository = new FakePunchRepository([WEEKDAY_SCHEDULE]);
    const services = createServices(repository, instant);
    await services.clockIn.clockIn(ACCOUNT_ID);
    const stateBeforeCheckOut = structuredClone(repository.state);
    const failingRepository = new FakePunchRepository(
      [WEEKDAY_SCHEDULE],
      new Map(),
      'updateDayCheckOut',
    );
    failingRepository.state = stateBeforeCheckOut;
    const failingServices = createServices(failingRepository, {
      current: ON_TIME_MONDAY_CHECKOUT_INSTANT,
    });

    await expect(failingServices.clockOut.clockOut(ACCOUNT_ID)).rejects.toThrow(
      'Injected failure.',
    );
    expect(failingRepository.state).toEqual(stateBeforeCheckOut);
  });
});

// Returns the first instant on the first read and the later instant on every read after it. The service reads the
// clock before the lock (to pick the day) and again after the lock (to stamp the punch), so the two reads can differ.
function twoReadClock(firstRead: Date, laterRead: Date): IClock {
  let readCount = 0;
  return {
    now: () => {
      readCount += 1;
      return new Date(readCount === 1 ? firstRead : laterRead);
    },
  };
}

describe('ClockOutService.clockOut after the day is locked (D-41)', () => {
  it('should store and return the instant read after the lock when the clock moves during the lock wait', async () => {
    const repository = new FakePunchRepository([WEEKDAY_SCHEDULE]);
    await new ClockInService(repository, fixedClock({ current: EARLY_MONDAY_CHECKIN_INSTANT }), {
      BUSINESS_TIMEZONE: TIMEZONE,
    }).clockIn(ACCOUNT_ID);
    // The first read is 17:55 WIB, which would be early. The post-lock read is 18:00 WIB, which is on time.
    const services = new ClockOutService(
      repository,
      twoReadClock(new Date('2026-11-02T10:55:00Z'), ON_TIME_MONDAY_CHECKOUT_INSTANT),
      { BUSINESS_TIMEZONE: TIMEZONE },
    );

    const response = await services.clockOut(ACCOUNT_ID);

    expect(response).toEqual({
      type: 'OUT',
      recordedAt: '2026-11-02T11:00:00.000Z',
      businessDate: MONDAY,
      classification: 'ON_TIME_CHECKOUT',
    });
    expect(repository.state.days[0]).toMatchObject({
      effectiveCheckoutAt: ON_TIME_MONDAY_CHECKOUT_INSTANT,
      checkoutStatusCode: 'ON_TIME_CHECKOUT',
    });
  });

  it('should reject the check-out as a retryable conflict and write nothing when midnight passes during the lock wait', async () => {
    const repository = new FakePunchRepository([WEEKDAY_SCHEDULE]);
    await new ClockInService(repository, fixedClock({ current: EARLY_MONDAY_CHECKIN_INSTANT }), {
      BUSINESS_TIMEZONE: TIMEZONE,
    }).clockIn(ACCOUNT_ID);
    const stateBeforeCheckOut = structuredClone(repository.state);
    // 23:59:30 WIB on Monday, then 00:00:10 WIB on Tuesday.
    const services = new ClockOutService(
      repository,
      twoReadClock(new Date('2026-11-02T16:59:30Z'), new Date('2026-11-02T17:00:10Z')),
      { BUSINESS_TIMEZONE: TIMEZONE },
    );

    await expect(services.clockOut(ACCOUNT_ID)).rejects.toMatchObject({
      name: 'CheckOutTimeConflictError',
      code: 'CONFLICT',
      kind: 'conflict',
    });
    expect(repository.state).toEqual(stateBeforeCheckOut);
  });

  it('should reject the check-out as a retryable conflict and write nothing when the post-lock instant precedes the check-in', async () => {
    const repository = new FakePunchRepository([WEEKDAY_SCHEDULE]);
    await new ClockInService(repository, fixedClock({ current: EARLY_MONDAY_CHECKIN_INSTANT }), {
      BUSINESS_TIMEZONE: TIMEZONE,
    }).clockIn(ACCOUNT_ID);
    const stateBeforeCheckOut = structuredClone(repository.state);
    // The first read is in the afternoon. The post-lock read is 08:29 WIB, one minute before the 08:30 WIB check-in.
    const services = new ClockOutService(
      repository,
      twoReadClock(ON_TIME_MONDAY_CHECKOUT_INSTANT, new Date('2026-11-02T01:29:00Z')),
      { BUSINESS_TIMEZONE: TIMEZONE },
    );

    await expect(services.clockOut(ACCOUNT_ID)).rejects.toBeInstanceOf(CheckOutTimeConflictError);
    expect(repository.state).toEqual(stateBeforeCheckOut);
  });
});
