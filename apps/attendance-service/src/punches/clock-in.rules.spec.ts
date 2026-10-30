import { buildNewAttendanceDay } from './clock-in.rules.js';
import type { DaySchedule } from '../classification/punch-classification.rules.js';
import type { ScheduleVersion } from './punch.repository.interface.js';

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

describe('buildNewAttendanceDay', () => {
  it.each([
    {
      condition: 'a working day',
      daySchedule: {
        isWorkingDay: true,
        timezone: 'Asia/Jakarta',
        scheduledStartAt: SCHEDULED_START_AT,
        scheduledEndAt: SCHEDULED_END_AT,
        lateCheckinGraceMinutes: 15,
        earlyCheckoutGraceMinutes: 0,
        lateCheckoutGraceMinutes: 0,
      } satisfies DaySchedule,
      expected: {
        isWorkingDay: true,
        scheduledStartAt: SCHEDULED_START_AT,
        scheduledEndAt: SCHEDULED_END_AT,
        checkinStatusCode: 'PENDING_CHECKIN',
        checkoutStatusCode: 'PENDING_CHECKOUT',
      },
    },
    {
      condition: 'a day off',
      daySchedule: {
        isWorkingDay: false,
        timezone: 'Asia/Jakarta',
        scheduledStartAt: null,
        scheduledEndAt: null,
      } satisfies DaySchedule,
      expected: {
        isWorkingDay: false,
        scheduledStartAt: null,
        scheduledEndAt: null,
        checkinStatusCode: 'CHECKIN_NOT_REQUIRED',
        checkoutStatusCode: 'CHECKOUT_NOT_REQUIRED',
      },
    },
  ])(
    'should snapshot the schedule and start the statuses for $condition',
    ({ daySchedule, expected }) => {
      const day = buildNewAttendanceDay({
        accountId: ACCOUNT_ID,
        businessDate: BUSINESS_DATE,
        scheduleVersion: SCHEDULE_VERSION,
        daySchedule,
      });

      expect(day).toEqual({
        accountId: ACCOUNT_ID,
        businessDate: BUSINESS_DATE,
        scheduleVersionId: SCHEDULE_VERSION.id,
        businessTimezone: 'Asia/Jakarta',
        dayStatusCode: 'PRESENT',
        ...expected,
      });
    },
  );
});
