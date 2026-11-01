import type { DaySchedule } from '../classification/punch-classification.rules.js';
import type { ScheduleVersion } from '../punches/punch.repository.interface.js';
import { buildAttendanceDay, type AttendanceDayOpening } from './attendance-day.rules.js';

const SCHEDULE_VERSION: ScheduleVersion = {
  id: '0c7d4a52-3f1e-4d8b-9a6c-2b5e7f8a9d01',
  timezone: 'Asia/Jakarta',
  workingWeekdays: [1, 2, 3, 4, 5],
  startTime: '09:00:00',
  endTime: '18:00:00',
  lateCheckinGraceMinutes: 15,
  earlyCheckoutGraceMinutes: 0,
  lateCheckoutGraceMinutes: 0,
};
const ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const BUSINESS_DATE = '2026-11-02';
const SCHEDULED_START_AT = new Date('2026-11-02T02:00:00Z');
const SCHEDULED_END_AT = new Date('2026-11-02T11:00:00Z');

const WORKING_DAY_SCHEDULE: DaySchedule = {
  isWorkingDay: true,
  timezone: 'Asia/Jakarta',
  scheduledStartAt: SCHEDULED_START_AT,
  scheduledEndAt: SCHEDULED_END_AT,
  lateCheckinGraceMinutes: 15,
  earlyCheckoutGraceMinutes: 0,
  lateCheckoutGraceMinutes: 0,
};
const DAY_OFF_SCHEDULE: DaySchedule = {
  isWorkingDay: false,
  timezone: 'Asia/Jakarta',
  scheduledStartAt: null,
  scheduledEndAt: null,
};

describe('buildAttendanceDay', () => {
  it.each([
    {
      condition: 'a punch on a working day',
      opening: 'PUNCH',
      daySchedule: WORKING_DAY_SCHEDULE,
      expected: {
        isWorkingDay: true,
        scheduledStartAt: SCHEDULED_START_AT,
        scheduledEndAt: SCHEDULED_END_AT,
        dayStatusCode: 'PRESENT',
        checkinStatusCode: 'PENDING_CHECKIN',
        checkoutStatusCode: 'PENDING_CHECKOUT',
      },
    },
    {
      condition: 'a punch on a day off',
      opening: 'PUNCH',
      daySchedule: DAY_OFF_SCHEDULE,
      expected: {
        isWorkingDay: false,
        scheduledStartAt: null,
        scheduledEndAt: null,
        dayStatusCode: 'PRESENT',
        checkinStatusCode: 'CHECKIN_NOT_REQUIRED',
        checkoutStatusCode: 'CHECKOUT_NOT_REQUIRED',
      },
    },
    {
      condition: 'a request on a working day',
      opening: 'REQUEST',
      daySchedule: WORKING_DAY_SCHEDULE,
      expected: {
        isWorkingDay: true,
        scheduledStartAt: SCHEDULED_START_AT,
        scheduledEndAt: SCHEDULED_END_AT,
        dayStatusCode: 'PENDING',
        checkinStatusCode: 'PENDING_CHECKIN',
        checkoutStatusCode: 'PENDING_CHECKOUT',
      },
    },
    {
      condition: 'a request on a day off',
      opening: 'REQUEST',
      daySchedule: DAY_OFF_SCHEDULE,
      expected: {
        isWorkingDay: false,
        scheduledStartAt: null,
        scheduledEndAt: null,
        dayStatusCode: 'DAY_OFF',
        checkinStatusCode: 'CHECKIN_NOT_REQUIRED',
        checkoutStatusCode: 'CHECKOUT_NOT_REQUIRED',
      },
    },
  ] satisfies ReadonlyArray<{
    readonly condition: string;
    readonly opening: AttendanceDayOpening;
    readonly daySchedule: DaySchedule;
    readonly expected: Record<string, unknown>;
  }>)(
    'should snapshot the schedule and start the statuses for $condition',
    ({ opening, daySchedule, expected }) => {
      const day = buildAttendanceDay({
        accountId: ACCOUNT_ID,
        businessDate: BUSINESS_DATE,
        scheduleVersion: SCHEDULE_VERSION,
        daySchedule,
        opening,
      });

      expect(day).toEqual({
        accountId: ACCOUNT_ID,
        businessDate: BUSINESS_DATE,
        scheduleVersionId: SCHEDULE_VERSION.id,
        businessTimezone: 'Asia/Jakarta',
        ...expected,
      });
    },
  );
});
