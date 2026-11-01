import type { DaySchedule } from '../classification/punch-classification.rules.js';
import { applyCorrectionToDay, type CorrectionApplyInput } from './correction-apply.rules.js';

// Monday 2026-11-02 in Asia/Jakarta: 09:00 to 18:00 WIB, late check-in grace 15, no other grace.
const WORKING_DAY: DaySchedule = {
  isWorkingDay: true,
  timezone: 'Asia/Jakarta',
  scheduledStartAt: new Date('2026-11-02T02:00:00Z'),
  scheduledEndAt: new Date('2026-11-02T11:00:00Z'),
  lateCheckinGraceMinutes: 15,
  earlyCheckoutGraceMinutes: 0,
  lateCheckoutGraceMinutes: 0,
};
const DAY_OFF: DaySchedule = {
  isWorkingDay: false,
  timezone: 'Asia/Jakarta',
  scheduledStartAt: null,
  scheduledEndAt: null,
};

// WIB instants on the business date, written as UTC.
const AT_0855_WIB = new Date('2026-11-02T01:55:00Z');
const AT_0910_WIB = new Date('2026-11-02T02:10:00Z');
const AT_0920_WIB = new Date('2026-11-02T02:20:00Z');
const AT_1730_WIB = new Date('2026-11-02T10:30:00Z');
const AT_1800_WIB = new Date('2026-11-02T11:00:00Z');
const AT_1830_WIB = new Date('2026-11-02T11:30:00Z');

describe('applyCorrectionToDay', () => {
  it.each<{
    condition: string;
    input: CorrectionApplyInput;
    expected: ReturnType<typeof applyCorrectionToDay>;
  }>([
    {
      condition: 'a working day, present with an early clock-in and an on-time clock-out',
      input: {
        daySchedule: WORKING_DAY,
        requestedOutcome: 'PRESENT',
        requestedCheckinAt: AT_0855_WIB,
        requestedCheckoutAt: AT_1800_WIB,
      },
      expected: {
        dayStatusCode: 'PRESENT',
        effectiveCheckinAt: AT_0855_WIB,
        effectiveCheckoutAt: AT_1800_WIB,
        checkinStatusCode: 'EARLY_CHECKIN',
        checkoutStatusCode: 'ON_TIME_CHECKOUT',
      },
    },
    {
      condition:
        'a working day, present with an on-time clock-in inside the grace and an early clock-out',
      input: {
        daySchedule: WORKING_DAY,
        requestedOutcome: 'PRESENT',
        requestedCheckinAt: AT_0910_WIB,
        requestedCheckoutAt: AT_1730_WIB,
      },
      expected: {
        dayStatusCode: 'PRESENT',
        effectiveCheckinAt: AT_0910_WIB,
        effectiveCheckoutAt: AT_1730_WIB,
        checkinStatusCode: 'ON_TIME_CHECKIN',
        checkoutStatusCode: 'EARLY_CHECKOUT',
      },
    },
    {
      condition: 'a working day, present with a late clock-in and a late clock-out',
      input: {
        daySchedule: WORKING_DAY,
        requestedOutcome: 'PRESENT',
        requestedCheckinAt: AT_0920_WIB,
        requestedCheckoutAt: AT_1830_WIB,
      },
      expected: {
        dayStatusCode: 'PRESENT',
        effectiveCheckinAt: AT_0920_WIB,
        effectiveCheckoutAt: AT_1830_WIB,
        checkinStatusCode: 'LATE_CHECKIN',
        checkoutStatusCode: 'LATE_CHECKOUT',
      },
    },
    {
      condition: 'a working day, present without a clock-out',
      input: {
        daySchedule: WORKING_DAY,
        requestedOutcome: 'PRESENT',
        requestedCheckinAt: AT_0855_WIB,
        requestedCheckoutAt: null,
      },
      expected: {
        dayStatusCode: 'PRESENT',
        effectiveCheckinAt: AT_0855_WIB,
        effectiveCheckoutAt: null,
        checkinStatusCode: 'EARLY_CHECKIN',
        checkoutStatusCode: 'PENDING_CHECKOUT',
      },
    },
    {
      condition: 'a day off, present with both times',
      input: {
        daySchedule: DAY_OFF,
        requestedOutcome: 'PRESENT',
        requestedCheckinAt: AT_0910_WIB,
        requestedCheckoutAt: AT_1800_WIB,
      },
      expected: {
        dayStatusCode: 'PRESENT',
        effectiveCheckinAt: AT_0910_WIB,
        effectiveCheckoutAt: AT_1800_WIB,
        checkinStatusCode: 'CHECKIN_NOT_REQUIRED',
        checkoutStatusCode: 'CHECKOUT_NOT_REQUIRED',
      },
    },
    {
      condition: 'a day off, present without a clock-out',
      input: {
        daySchedule: DAY_OFF,
        requestedOutcome: 'PRESENT',
        requestedCheckinAt: AT_0910_WIB,
        requestedCheckoutAt: null,
      },
      expected: {
        dayStatusCode: 'PRESENT',
        effectiveCheckinAt: AT_0910_WIB,
        effectiveCheckoutAt: null,
        checkinStatusCode: 'CHECKIN_NOT_REQUIRED',
        checkoutStatusCode: 'CHECKOUT_NOT_REQUIRED',
      },
    },
    {
      condition: 'a working day, sick leave',
      input: {
        daySchedule: WORKING_DAY,
        requestedOutcome: 'SICK_LEAVE',
        requestedCheckinAt: null,
        requestedCheckoutAt: null,
      },
      expected: {
        dayStatusCode: 'SICK_LEAVE',
        effectiveCheckinAt: null,
        effectiveCheckoutAt: null,
        checkinStatusCode: 'CHECKIN_NOT_REQUIRED',
        checkoutStatusCode: 'CHECKOUT_NOT_REQUIRED',
      },
    },
    {
      condition: 'a working day, leave',
      input: {
        daySchedule: WORKING_DAY,
        requestedOutcome: 'LEAVE',
        requestedCheckinAt: null,
        requestedCheckoutAt: null,
      },
      expected: {
        dayStatusCode: 'LEAVE',
        effectiveCheckinAt: null,
        effectiveCheckoutAt: null,
        checkinStatusCode: 'CHECKIN_NOT_REQUIRED',
        checkoutStatusCode: 'CHECKOUT_NOT_REQUIRED',
      },
    },
    {
      condition: 'a day off, sick leave',
      input: {
        daySchedule: DAY_OFF,
        requestedOutcome: 'SICK_LEAVE',
        requestedCheckinAt: null,
        requestedCheckoutAt: null,
      },
      expected: {
        dayStatusCode: 'SICK_LEAVE',
        effectiveCheckinAt: null,
        effectiveCheckoutAt: null,
        checkinStatusCode: 'CHECKIN_NOT_REQUIRED',
        checkoutStatusCode: 'CHECKOUT_NOT_REQUIRED',
      },
    },
  ])('should apply the correction for $condition', ({ input, expected }) => {
    expect(applyCorrectionToDay(input)).toEqual(expected);
  });

  it('should refuse a present correction without a clock-in because the stored request is broken', () => {
    expect(() =>
      applyCorrectionToDay({
        daySchedule: WORKING_DAY,
        requestedOutcome: 'PRESENT',
        requestedCheckinAt: null,
        requestedCheckoutAt: null,
      }),
    ).toThrow(RangeError);
  });
});
