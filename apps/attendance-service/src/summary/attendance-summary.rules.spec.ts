import type { AttendanceSummaryItem } from '@dexa/contracts';
import type { AttendanceSummaryRecord } from './attendance-summary.repository.interface.js';
import { toAttendanceSummaryItem } from './attendance-summary.rules.js';

const BUSINESS_DATE = '2026-11-06';
const CHECKIN_AT = new Date('2026-11-06T02:05:00Z');
const CHECKOUT_AT = new Date('2026-11-06T11:00:00Z');

// A day with both punches and no approved overtime, so a test changes only the field it is about.
const WORKED_RECORD: AttendanceSummaryRecord = {
  businessDate: BUSINESS_DATE,
  dayStatusCode: 'PRESENT',
  effectiveCheckinAt: CHECKIN_AT,
  checkinStatusCode: 'ON_TIME_CHECKIN',
  effectiveCheckoutAt: CHECKOUT_AT,
  checkoutStatusCode: 'ON_TIME_CHECKOUT',
  approvedOvertimeMinutes: 0,
};

// A request created the day with no punch, so the day has no check-in time and keeps its stored statuses (D-59).
describe('toAttendanceSummaryItem', () => {
  it.each<{
    condition: string;
    record: AttendanceSummaryRecord;
    expected: AttendanceSummaryItem;
  }>([
    {
      condition: 'a working day has both punches',
      record: WORKED_RECORD,
      expected: {
        businessDate: BUSINESS_DATE,
        dayStatus: 'PRESENT',
        approvedOvertimeMinutes: 0,
        clockInAt: CHECKIN_AT.toISOString(),
        clockInStatus: 'ON_TIME_CHECKIN',
        clockOutAt: CHECKOUT_AT.toISOString(),
        clockOutStatus: 'ON_TIME_CHECKOUT',
      },
    },
    {
      condition: 'a working day has no check-in yet',
      record: {
        ...WORKED_RECORD,
        dayStatusCode: 'PENDING',
        effectiveCheckinAt: null,
        checkinStatusCode: 'PENDING_CHECKIN',
        effectiveCheckoutAt: null,
        checkoutStatusCode: 'PENDING_CHECKOUT',
      },
      expected: {
        businessDate: BUSINESS_DATE,
        dayStatus: 'PENDING',
        approvedOvertimeMinutes: 0,
        clockInAt: null,
        clockInStatus: 'PENDING_CHECKIN',
        clockOutAt: null,
        clockOutStatus: 'PENDING_CHECKOUT',
      },
    },
    {
      condition: 'a day off has no check-in and its check-in is not required',
      record: {
        ...WORKED_RECORD,
        dayStatusCode: 'DAY_OFF',
        approvedOvertimeMinutes: 120,
        effectiveCheckinAt: null,
        checkinStatusCode: 'CHECKIN_NOT_REQUIRED',
        effectiveCheckoutAt: null,
        checkoutStatusCode: 'CHECKOUT_NOT_REQUIRED',
      },
      expected: {
        businessDate: BUSINESS_DATE,
        dayStatus: 'DAY_OFF',
        approvedOvertimeMinutes: 120,
        clockInAt: null,
        clockInStatus: 'CHECKIN_NOT_REQUIRED',
        clockOutAt: null,
        clockOutStatus: 'CHECKOUT_NOT_REQUIRED',
      },
    },
    {
      condition: 'an approved sick leave has no punch',
      record: {
        ...WORKED_RECORD,
        dayStatusCode: 'SICK_LEAVE',
        effectiveCheckinAt: null,
        checkinStatusCode: 'CHECKIN_NOT_REQUIRED',
        effectiveCheckoutAt: null,
        checkoutStatusCode: 'CHECKOUT_NOT_REQUIRED',
      },
      expected: {
        businessDate: BUSINESS_DATE,
        dayStatus: 'SICK_LEAVE',
        approvedOvertimeMinutes: 0,
        clockInAt: null,
        clockInStatus: 'CHECKIN_NOT_REQUIRED',
        clockOutAt: null,
        clockOutStatus: 'CHECKOUT_NOT_REQUIRED',
      },
    },
    {
      condition: 'an approved leave has no punch',
      record: {
        ...WORKED_RECORD,
        dayStatusCode: 'LEAVE',
        effectiveCheckinAt: null,
        checkinStatusCode: 'CHECKIN_NOT_REQUIRED',
        effectiveCheckoutAt: null,
        checkoutStatusCode: 'CHECKOUT_NOT_REQUIRED',
      },
      expected: {
        businessDate: BUSINESS_DATE,
        dayStatus: 'LEAVE',
        approvedOvertimeMinutes: 0,
        clockInAt: null,
        clockInStatus: 'CHECKIN_NOT_REQUIRED',
        clockOutAt: null,
        clockOutStatus: 'CHECKOUT_NOT_REQUIRED',
      },
    },
    {
      condition: 'a day has a check-in and no check-out yet',
      record: {
        ...WORKED_RECORD,
        effectiveCheckoutAt: null,
        checkoutStatusCode: 'PENDING_CHECKOUT',
      },
      expected: {
        businessDate: BUSINESS_DATE,
        dayStatus: 'PRESENT',
        approvedOvertimeMinutes: 0,
        clockInAt: CHECKIN_AT.toISOString(),
        clockInStatus: 'ON_TIME_CHECKIN',
        clockOutAt: null,
        clockOutStatus: 'PENDING_CHECKOUT',
      },
    },
    {
      condition: 'a day has approved overtime with seconds, which is not rounded',
      record: { ...WORKED_RECORD, approvedOvertimeMinutes: 90.5 },
      expected: {
        businessDate: BUSINESS_DATE,
        dayStatus: 'PRESENT',
        approvedOvertimeMinutes: 90.5,
        clockInAt: CHECKIN_AT.toISOString(),
        clockInStatus: 'ON_TIME_CHECKIN',
        clockOutAt: CHECKOUT_AT.toISOString(),
        clockOutStatus: 'ON_TIME_CHECKOUT',
      },
    },
  ])('should map the row with the stored statuses when $condition', ({ record, expected }) => {
    expect(toAttendanceSummaryItem(record)).toEqual(expected);
  });

  it.each([
    {
      condition: 'a day with no check-in has a classified check-in status',
      record: {
        ...WORKED_RECORD,
        effectiveCheckinAt: null,
        checkinStatusCode: 'ON_TIME_CHECKIN',
        effectiveCheckoutAt: null,
        checkoutStatusCode: 'PENDING_CHECKOUT',
      },
    },
    {
      condition: 'a day with no check-in has a check-out time',
      record: {
        ...WORKED_RECORD,
        effectiveCheckinAt: null,
        checkinStatusCode: 'PENDING_CHECKIN',
        effectiveCheckoutAt: CHECKOUT_AT,
        checkoutStatusCode: 'ON_TIME_CHECKOUT',
      },
    },
    {
      condition: 'the day status code is not a DAY status',
      record: { ...WORKED_RECORD, dayStatusCode: 'ON_TIME_CHECKIN' },
    },
  ])('should refuse the row when $condition', ({ record }) => {
    expect(() => toAttendanceSummaryItem(record)).toThrow();
  });
});
