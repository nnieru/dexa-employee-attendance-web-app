import {
  FakePunchRepository,
  MONDAY,
  SCHEDULE_ID,
  WEEKDAY_SCHEDULE,
} from '../../test/fake-punch-repository.js';
import { ScheduleNotConfiguredError } from '../punches/punch.errors.js';
import { findOrCreateAttendanceDayForUpdate } from './find-or-create-attendance-day.js';

const ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const SATURDAY = '2026-11-07';

describe('findOrCreateAttendanceDayForUpdate', () => {
  it('should create the day as PENDING with pending timing when a request arrives for a working day with no punch', async () => {
    const repository = new FakePunchRepository([WEEKDAY_SCHEDULE]);

    const day = await repository.runInTransaction((transaction) =>
      findOrCreateAttendanceDayForUpdate(transaction, {
        accountId: ACCOUNT_ID,
        businessDate: MONDAY,
        opening: 'REQUEST',
      }),
    );

    expect(repository.state.days).toEqual([
      expect.objectContaining({
        id: day.dayId,
        accountId: ACCOUNT_ID,
        businessDate: MONDAY,
        scheduleVersionId: SCHEDULE_ID,
        dayStatusCode: 'PENDING',
        checkinStatusCode: 'PENDING_CHECKIN',
        checkoutStatusCode: 'PENDING_CHECKOUT',
        revision: 1,
      }),
    ]);
  });

  it('should create the day as DAY_OFF with timing not required when a request arrives for a day off', async () => {
    const repository = new FakePunchRepository([WEEKDAY_SCHEDULE]);

    await repository.runInTransaction((transaction) =>
      findOrCreateAttendanceDayForUpdate(transaction, {
        accountId: ACCOUNT_ID,
        businessDate: SATURDAY,
        opening: 'REQUEST',
      }),
    );

    expect(repository.state.days[0]).toMatchObject({
      businessDate: SATURDAY,
      dayStatusCode: 'DAY_OFF',
      checkinStatusCode: 'CHECKIN_NOT_REQUIRED',
      checkoutStatusCode: 'CHECKOUT_NOT_REQUIRED',
    });
  });

  it('should return the existing day unchanged when the day was already created by a punch', async () => {
    const repository = new FakePunchRepository([WEEKDAY_SCHEDULE]);
    const created = await repository.runInTransaction((transaction) =>
      findOrCreateAttendanceDayForUpdate(transaction, {
        accountId: ACCOUNT_ID,
        businessDate: MONDAY,
        opening: 'PUNCH',
      }),
    );
    const stateBefore = structuredClone(repository.state);

    const found = await repository.runInTransaction((transaction) =>
      findOrCreateAttendanceDayForUpdate(transaction, {
        accountId: ACCOUNT_ID,
        businessDate: MONDAY,
        opening: 'REQUEST',
      }),
    );

    expect(found).toEqual(created);
    expect(repository.state).toEqual(stateBefore);
    expect(repository.state.days[0]?.dayStatusCode).toBe('PRESENT');
  });

  it('should reject with ScheduleNotConfiguredError and write no day when no schedule covers the date', async () => {
    const repository = new FakePunchRepository([WEEKDAY_SCHEDULE]);

    await expect(
      repository.runInTransaction((transaction) =>
        findOrCreateAttendanceDayForUpdate(transaction, {
          accountId: ACCOUNT_ID,
          businessDate: '2026-10-01',
          opening: 'REQUEST',
        }),
      ),
    ).rejects.toBeInstanceOf(ScheduleNotConfiguredError);
    expect(repository.state.days).toEqual([]);
  });
});
