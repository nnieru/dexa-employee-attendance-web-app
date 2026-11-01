import { ClockInService } from './clock-in.service.js';
import {
  AttendanceAlreadyClockedInError,
  AttendanceDayOnLeaveError,
  ScheduleNotConfiguredError,
} from './punch.errors.js';
import {
  FakePunchRepository,
  MONDAY,
  applyApprovedLeave,
  SCHEDULE_ID,
  TIMEZONE,
  WEEKDAY_SCHEDULE,
  fixedClock,
} from '../../test/fake-punch-repository.js';

const ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const OTHER_ACCOUNT_ID = '7a1d2e3f-4b5c-4d6e-8f70-1a2b3c4d5e6f';
const TUESDAY = '2026-11-03';

// 09:20 WIB is 02:20 UTC. 23:59 WIB and 00:01 WIB straddle the business-day boundary.
const LATE_MONDAY_INSTANT = new Date('2026-11-02T02:20:00Z');
const EARLY_MONDAY_INSTANT = new Date('2026-11-02T01:30:00Z');
const LAST_MINUTE_MONDAY_INSTANT = new Date('2026-11-02T16:59:00Z');
const FIRST_MINUTE_TUESDAY_INSTANT = new Date('2026-11-02T17:01:00Z');

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

  it.each([
    { condition: 'Sick leave', dayStatusCode: 'SICK_LEAVE' as const },
    { condition: 'Leave', dayStatusCode: 'LEAVE' as const },
  ])(
    'should reject the punch with the leave error and write nothing when the day is approved $condition after a raw clock-in',
    async ({ dayStatusCode }) => {
      const instant = { current: EARLY_MONDAY_INSTANT };
      const repository = new FakePunchRepository([WEEKDAY_SCHEDULE]);
      const service = createService({ repository, instant });
      await service.clockIn(ACCOUNT_ID);
      applyApprovedLeave(repository, dayStatusCode);
      const stateBeforeRetry = structuredClone(repository.state);

      instant.current = LATE_MONDAY_INSTANT;

      await expect(service.clockIn(ACCOUNT_ID)).rejects.toBeInstanceOf(AttendanceDayOnLeaveError);
      expect(repository.state).toEqual(stateBeforeRetry);
    },
  );

  it('should reject the punch with the leave error, not the already-clocked-in error, when a raw clock-in precedes the leave', async () => {
    const instant = { current: EARLY_MONDAY_INSTANT };
    const repository = new FakePunchRepository([WEEKDAY_SCHEDULE]);
    const service = createService({ repository, instant });
    await service.clockIn(ACCOUNT_ID);
    applyApprovedLeave(repository, 'LEAVE');

    instant.current = LATE_MONDAY_INSTANT;

    await expect(service.clockIn(ACCOUNT_ID)).rejects.toBeInstanceOf(AttendanceDayOnLeaveError);
  });

  it('should keep the day and its statuses unchanged when a punch is refused for leave', async () => {
    const instant = { current: EARLY_MONDAY_INSTANT };
    const repository = new FakePunchRepository([WEEKDAY_SCHEDULE]);
    const service = createService({ repository, instant });
    await service.clockIn(ACCOUNT_ID);
    applyApprovedLeave(repository, 'SICK_LEAVE');
    const dayBefore = structuredClone(repository.state.days);

    instant.current = LATE_MONDAY_INSTANT;
    await expect(service.clockIn(ACCOUNT_ID)).rejects.toBeInstanceOf(AttendanceDayOnLeaveError);

    expect(repository.state.days).toEqual(dayBefore);
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
