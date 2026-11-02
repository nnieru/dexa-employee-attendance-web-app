import type { DaySchedule } from '../classification/punch-classification.rules.js';
import {
  evaluateOvertimePolicy,
  OVERTIME_DAILY_CAP_MINUTES,
  OVERTIME_POLICY_VIOLATION,
  OVERTIME_SUBMISSION_WINDOW_DAYS,
  type OvertimePolicyInput,
  type OvertimePolicyResult,
} from './overtime-policy.rules.js';

const BUSINESS_TIMEZONE = 'Asia/Jakarta';
// 19:00 WIB on Monday 2026-11-02, so "today" in the business timezone is 2026-11-02.
const NOW = new Date('2026-11-02T12:00:00Z');
const DAY_OFF_SNAPSHOT: DaySchedule = {
  isWorkingDay: false,
  timezone: BUSINESS_TIMEZONE,
  scheduledStartAt: null,
  scheduledEndAt: null,
};
// 09:00-18:00 WIB on 2026-11-02 (default schedule).
const WORKING_DAY_SNAPSHOT: DaySchedule = {
  isWorkingDay: true,
  timezone: BUSINESS_TIMEZONE,
  scheduledStartAt: new Date('2026-11-02T02:00:00Z'),
  scheduledEndAt: new Date('2026-11-02T11:00:00Z'),
  lateCheckinGraceMinutes: 15,
  earlyCheckoutGraceMinutes: 0,
  lateCheckoutGraceMinutes: 0,
};
const MS_PER_MINUTE = 60_000;

function wibInstant(localDateTime: string): Date {
  return new Date(`${localDateTime}+07:00`);
}

function minutesAfter(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * MS_PER_MINUTE);
}

const OK: OvertimePolicyResult = { kind: 'ok' };

function violation(code: keyof typeof OVERTIME_POLICY_VIOLATION): OvertimePolicyResult {
  return { kind: 'violation', violation: OVERTIME_POLICY_VIOLATION[code] };
}

type OvertimePolicyRow = {
  readonly condition: string;
  readonly result: string;
  readonly input: Omit<OvertimePolicyInput, 'now' | 'businessTimezone'>;
  readonly expected: OvertimePolicyResult;
};

/** A day-off request from 10:00 to 12:00 WIB on the business date, with no minutes already requested. */
function dayOffRequest(businessDate: string): OvertimePolicyRow['input'] {
  return {
    businessDate,
    startAt: wibInstant(`${businessDate}T10:00:00`),
    endAt: wibInstant(`${businessDate}T12:00:00`),
    daySchedule: DAY_OFF_SNAPSHOT,
    existingActiveMinutes: 0,
  };
}

describe('evaluateOvertimePolicy', () => {
  it('should use a 7-day submission window and a 240-minute daily cap', () => {
    expect(OVERTIME_SUBMISSION_WINDOW_DAYS).toBe(7);
    expect(OVERTIME_DAILY_CAP_MINUTES).toBe(240);
  });

  it.each<OvertimePolicyRow>([
    {
      condition: 'the business date is today',
      result: 'allow the request',
      input: dayOffRequest('2026-11-02'),
      expected: OK,
    },
    {
      condition: 'the business date is 7 days back',
      result: 'allow the request',
      input: dayOffRequest('2026-10-26'),
      expected: OK,
    },
    {
      condition: 'the business date is 8 days back',
      result: 'reject the request as BUSINESS_DATE_OUTSIDE_WINDOW',
      input: dayOffRequest('2026-10-25'),
      expected: violation('BUSINESS_DATE_OUTSIDE_WINDOW'),
    },
    {
      condition: 'the business date is tomorrow',
      result: 'reject the request as BUSINESS_DATE_OUTSIDE_WINDOW',
      input: dayOffRequest('2026-11-03'),
      expected: violation('BUSINESS_DATE_OUTSIDE_WINDOW'),
    },
    {
      condition: 'the start is on the previous business date and the end is on the requested date',
      result: 'reject the request as START_NOT_ON_BUSINESS_DATE',
      input: {
        ...dayOffRequest('2026-11-02'),
        startAt: wibInstant('2026-11-01T23:00:00'),
        endAt: wibInstant('2026-11-02T01:00:00'),
      },
      expected: violation('START_NOT_ON_BUSINESS_DATE'),
    },
    {
      condition: 'the end is equal to the start',
      result: 'reject the request as END_NOT_AFTER_START',
      input: {
        ...dayOffRequest('2026-11-02'),
        startAt: wibInstant('2026-11-02T10:00:00'),
        endAt: wibInstant('2026-11-02T10:00:00'),
      },
      expected: violation('END_NOT_AFTER_START'),
    },
    {
      condition: 'the end is before the start',
      result: 'reject the request as END_NOT_AFTER_START',
      input: {
        ...dayOffRequest('2026-11-02'),
        startAt: wibInstant('2026-11-02T12:00:00'),
        endAt: wibInstant('2026-11-02T10:00:00'),
      },
      expected: violation('END_NOT_AFTER_START'),
    },
    {
      condition: 'a working day starts at 18:00, the scheduled end',
      result: 'allow the request',
      input: {
        ...dayOffRequest('2026-11-02'),
        startAt: wibInstant('2026-11-02T18:00:00'),
        endAt: wibInstant('2026-11-02T20:00:00'),
        daySchedule: WORKING_DAY_SNAPSHOT,
      },
      expected: OK,
    },
    {
      condition: 'a working day starts at 17:59, one minute before the scheduled end',
      result: 'reject the request as START_BEFORE_SCHEDULED_END',
      input: {
        ...dayOffRequest('2026-11-02'),
        startAt: wibInstant('2026-11-02T17:59:00'),
        endAt: wibInstant('2026-11-02T20:00:00'),
        daySchedule: WORKING_DAY_SNAPSHOT,
      },
      expected: violation('START_BEFORE_SCHEDULED_END'),
    },
    {
      condition: 'a working day starts at 22:00 and the end falls on the next business date',
      result: 'allow the request',
      input: {
        ...dayOffRequest('2026-11-02'),
        startAt: wibInstant('2026-11-02T22:00:00'),
        endAt: wibInstant('2026-11-03T01:00:00'),
        daySchedule: WORKING_DAY_SNAPSHOT,
      },
      expected: OK,
    },
    {
      condition: 'the business date is a day off and the start is 07:00',
      result: 'allow the request',
      input: {
        ...dayOffRequest('2026-11-02'),
        startAt: wibInstant('2026-11-02T07:00:00'),
        endAt: wibInstant('2026-11-02T09:00:00'),
        daySchedule: DAY_OFF_SNAPSHOT,
      },
      expected: OK,
    },
    {
      condition: 'no minutes exist yet and the request is exactly 240 minutes',
      result: 'allow the request',
      input: {
        ...dayOffRequest('2026-11-02'),
        endAt: minutesAfter(wibInstant('2026-11-02T10:00:00'), 240),
      },
      expected: OK,
    },
    {
      condition: 'no minutes exist yet and the request is 241 minutes',
      result: 'reject the request as DAILY_CAP_EXCEEDED',
      input: {
        ...dayOffRequest('2026-11-02'),
        endAt: minutesAfter(wibInstant('2026-11-02T10:00:00'), 241),
      },
      expected: violation('DAILY_CAP_EXCEEDED'),
    },
    {
      condition: 'an existing 120 minutes and the request is 120 minutes, which totals 240',
      result: 'allow the request',
      input: {
        ...dayOffRequest('2026-11-02'),
        endAt: minutesAfter(wibInstant('2026-11-02T10:00:00'), 120),
        existingActiveMinutes: 120,
      },
      expected: OK,
    },
    {
      condition: 'an existing 120 minutes and the request is 121 minutes, which totals 241',
      result: 'reject the request as DAILY_CAP_EXCEEDED',
      input: {
        ...dayOffRequest('2026-11-02'),
        endAt: minutesAfter(wibInstant('2026-11-02T10:00:00'), 121),
        existingActiveMinutes: 120,
      },
      expected: violation('DAILY_CAP_EXCEEDED'),
    },
    {
      condition: 'an existing 239 minutes and the request is 1 minute, which totals 240',
      result: 'allow the request',
      input: {
        ...dayOffRequest('2026-11-02'),
        endAt: minutesAfter(wibInstant('2026-11-02T10:00:00'), 1),
        existingActiveMinutes: 239,
      },
      expected: OK,
    },
    {
      condition: 'an existing 1 minute and the request is 240 minutes, which totals 241',
      result: 'reject the request as DAILY_CAP_EXCEEDED',
      input: {
        ...dayOffRequest('2026-11-02'),
        endAt: minutesAfter(wibInstant('2026-11-02T10:00:00'), 240),
        existingActiveMinutes: 1,
      },
      expected: violation('DAILY_CAP_EXCEEDED'),
    },
    {
      condition:
        'the request is 240 minutes and 30 seconds, which is above the cap without rounding',
      result: 'reject the request as DAILY_CAP_EXCEEDED',
      input: {
        ...dayOffRequest('2026-11-02'),
        endAt: new Date(minutesAfter(wibInstant('2026-11-02T10:00:00'), 240).getTime() + 30_000),
      },
      expected: violation('DAILY_CAP_EXCEEDED'),
    },
  ])('should $result when $condition', ({ input, expected }) => {
    const result = evaluateOvertimePolicy({
      ...input,
      now: NOW,
      businessTimezone: BUSINESS_TIMEZONE,
    });

    expect(result).toEqual(expected);
  });
});
