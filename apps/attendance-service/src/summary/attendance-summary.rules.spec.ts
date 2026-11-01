import type { AttendanceSummaryItem } from '@dexa/contracts';
import type { AttendanceSummaryRecord } from './attendance-summary.repository.interface.js';
import { toAttendanceSummaryItem } from './attendance-summary.rules.js';

const BUSINESS_DATE = '2026-11-06';
const CHECKIN_AT = new Date('2026-11-06T02:05:00Z');
const CHECKOUT_AT = new Date('2026-11-06T11:00:00Z');

// A request created the day with no punch, so the day has no check-in time and keeps its stored statuses (D-59).
describe('toAttendanceSummaryItem', () => {
  it.each<{
    condition: string;
    record: AttendanceSummaryRecord;
    expected: AttendanceSummaryItem;
  }>([
    {
      condition: 'a working day has no check-in yet',
      record: {
        businessDate: BUSINESS_DATE,
        effectiveCheckinAt: null,
        checkinStatusCode: 'PENDING_CHECKIN',
        effectiveCheckoutAt: null,
        checkoutStatusCode: 'PENDING_CHECKOUT',
      },
      expected: {
        businessDate: BUSINESS_DATE,
        clockInAt: null,
        clockInStatus: 'PENDING_CHECKIN',
        clockOutAt: null,
        clockOutStatus: 'PENDING_CHECKOUT',
      },
    },
    {
      condition: 'a day off has no check-in and its check-in is not required',
      record: {
        businessDate: BUSINESS_DATE,
        effectiveCheckinAt: null,
        checkinStatusCode: 'CHECKIN_NOT_REQUIRED',
        effectiveCheckoutAt: null,
        checkoutStatusCode: 'CHECKOUT_NOT_REQUIRED',
      },
      expected: {
        businessDate: BUSINESS_DATE,
        clockInAt: null,
        clockInStatus: 'CHECKIN_NOT_REQUIRED',
        clockOutAt: null,
        clockOutStatus: 'CHECKOUT_NOT_REQUIRED',
      },
    },
    {
      condition: 'a day has a check-in and no check-out yet',
      record: {
        businessDate: BUSINESS_DATE,
        effectiveCheckinAt: CHECKIN_AT,
        checkinStatusCode: 'ON_TIME_CHECKIN',
        effectiveCheckoutAt: null,
        checkoutStatusCode: 'PENDING_CHECKOUT',
      },
      expected: {
        businessDate: BUSINESS_DATE,
        clockInAt: CHECKIN_AT.toISOString(),
        clockInStatus: 'ON_TIME_CHECKIN',
        clockOutAt: null,
        clockOutStatus: 'PENDING_CHECKOUT',
      },
    },
  ])('should map the row with the stored statuses when $condition', ({ record, expected }) => {
    expect(toAttendanceSummaryItem(record)).toEqual(expected);
  });

  it.each([
    {
      condition: 'a day with no check-in has a classified check-in status',
      record: {
        businessDate: BUSINESS_DATE,
        effectiveCheckinAt: null,
        checkinStatusCode: 'ON_TIME_CHECKIN',
        effectiveCheckoutAt: null,
        checkoutStatusCode: 'PENDING_CHECKOUT',
      },
    },
    {
      condition: 'a day with no check-in has a check-out time',
      record: {
        businessDate: BUSINESS_DATE,
        effectiveCheckinAt: null,
        checkinStatusCode: 'PENDING_CHECKIN',
        effectiveCheckoutAt: CHECKOUT_AT,
        checkoutStatusCode: 'ON_TIME_CHECKOUT',
      },
    },
  ])('should refuse the row when $condition', ({ record }) => {
    expect(() => toAttendanceSummaryItem(record)).toThrow();
  });
});
