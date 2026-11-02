import { attendanceMonitoringItemSchema, type EmployeeLookupItem } from '@dexa/contracts';
import type { AttendanceMonitoringRecord } from './attendance-monitoring.repository.interface.js';
import { toAttendanceMonitoringItem } from './attendance-monitoring.rules.js';

const ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const BUSINESS_DATE = '2026-11-06';
const EMPLOYEE: EmployeeLookupItem = {
  accountId: ACCOUNT_ID,
  name: 'Dewi Anggraini',
  positionName: 'Engineer',
};
const EMPLOYEE_BY_ACCOUNT_ID = new Map([[ACCOUNT_ID, EMPLOYEE]]);

// A day with both punches, corrected or not, and no approved overtime. A test changes only the field it is about.
const PUNCHED_RECORD: AttendanceMonitoringRecord = {
  accountId: ACCOUNT_ID,
  businessDate: BUSINESS_DATE,
  dayStatusCode: 'PRESENT',
  effectiveCheckinAt: new Date('2026-11-06T02:05:00Z'),
  checkinStatusCode: 'ON_TIME_CHECKIN',
  effectiveCheckoutAt: new Date('2026-11-06T11:00:00Z'),
  checkoutStatusCode: 'ON_TIME_CHECKOUT',
  approvedOvertimeMinutes: 0,
  rawClockInAt: new Date('2026-11-06T02:05:00Z'),
  rawClockOutAt: new Date('2026-11-06T11:00:00Z'),
  isCorrected: false,
};

// The HR list shows a request-created day with no punch as a row with no clock-in time, and the raw punches
// are null because the employee never punched.
describe('toAttendanceMonitoringItem', () => {
  it.each<{
    condition: string;
    record: AttendanceMonitoringRecord;
    expected: Omit<ReturnType<typeof toAttendanceMonitoringItem>, 'accountId' | 'employee'>;
  }>([
    {
      condition: 'a punched day is not corrected',
      record: PUNCHED_RECORD,
      expected: {
        businessDate: BUSINESS_DATE,
        dayStatus: 'PRESENT',
        approvedOvertimeMinutes: 0,
        rawClockInAt: '2026-11-06T02:05:00.000Z',
        rawClockOutAt: '2026-11-06T11:00:00.000Z',
        isCorrected: false,
        clockInAt: '2026-11-06T02:05:00.000Z',
        clockInStatus: 'ON_TIME_CHECKIN',
        clockOutAt: '2026-11-06T11:00:00.000Z',
        clockOutStatus: 'ON_TIME_CHECKOUT',
      },
    },
    {
      condition: 'a correction moved the effective times away from the raw punches',
      record: {
        ...PUNCHED_RECORD,
        effectiveCheckinAt: new Date('2026-11-06T02:20:00Z'),
        checkinStatusCode: 'LATE_CHECKIN',
        effectiveCheckoutAt: new Date('2026-11-06T10:00:00Z'),
        checkoutStatusCode: 'EARLY_CHECKOUT',
        rawClockInAt: new Date('2026-11-06T03:00:00Z'),
        rawClockOutAt: new Date('2026-11-06T11:00:00Z'),
        isCorrected: true,
      },
      expected: {
        businessDate: BUSINESS_DATE,
        dayStatus: 'PRESENT',
        approvedOvertimeMinutes: 0,
        rawClockInAt: '2026-11-06T03:00:00.000Z',
        rawClockOutAt: '2026-11-06T11:00:00.000Z',
        isCorrected: true,
        clockInAt: '2026-11-06T02:20:00.000Z',
        clockInStatus: 'LATE_CHECKIN',
        clockOutAt: '2026-11-06T10:00:00.000Z',
        clockOutStatus: 'EARLY_CHECKOUT',
      },
    },
    {
      condition: 'an approved leave cleared the punches, and the raw punches remain',
      record: {
        ...PUNCHED_RECORD,
        dayStatusCode: 'LEAVE',
        effectiveCheckinAt: null,
        checkinStatusCode: 'CHECKIN_NOT_REQUIRED',
        effectiveCheckoutAt: null,
        checkoutStatusCode: 'CHECKOUT_NOT_REQUIRED',
        isCorrected: true,
      },
      expected: {
        businessDate: BUSINESS_DATE,
        dayStatus: 'LEAVE',
        approvedOvertimeMinutes: 0,
        rawClockInAt: '2026-11-06T02:05:00.000Z',
        rawClockOutAt: '2026-11-06T11:00:00.000Z',
        isCorrected: true,
        clockInAt: null,
        clockInStatus: 'CHECKIN_NOT_REQUIRED',
        clockOutAt: null,
        clockOutStatus: 'CHECKOUT_NOT_REQUIRED',
      },
    },
    {
      condition: 'a working day has no check-in yet',
      record: {
        ...PUNCHED_RECORD,
        dayStatusCode: 'PENDING',
        effectiveCheckinAt: null,
        checkinStatusCode: 'PENDING_CHECKIN',
        effectiveCheckoutAt: null,
        checkoutStatusCode: 'PENDING_CHECKOUT',
        rawClockInAt: null,
        rawClockOutAt: null,
      },
      expected: {
        businessDate: BUSINESS_DATE,
        dayStatus: 'PENDING',
        approvedOvertimeMinutes: 0,
        rawClockInAt: null,
        rawClockOutAt: null,
        isCorrected: false,
        clockInAt: null,
        clockInStatus: 'PENDING_CHECKIN',
        clockOutAt: null,
        clockOutStatus: 'PENDING_CHECKOUT',
      },
    },
    {
      condition: 'a day off has approved overtime and no punch',
      record: {
        ...PUNCHED_RECORD,
        dayStatusCode: 'DAY_OFF',
        approvedOvertimeMinutes: 150.5,
        effectiveCheckinAt: null,
        checkinStatusCode: 'CHECKIN_NOT_REQUIRED',
        effectiveCheckoutAt: null,
        checkoutStatusCode: 'CHECKOUT_NOT_REQUIRED',
        rawClockInAt: null,
        rawClockOutAt: null,
      },
      expected: {
        businessDate: BUSINESS_DATE,
        dayStatus: 'DAY_OFF',
        approvedOvertimeMinutes: 150.5,
        rawClockInAt: null,
        rawClockOutAt: null,
        isCorrected: false,
        clockInAt: null,
        clockInStatus: 'CHECKIN_NOT_REQUIRED',
        clockOutAt: null,
        clockOutStatus: 'CHECKOUT_NOT_REQUIRED',
      },
    },
  ])(
    'should map the row with the raw and effective times when $condition',
    ({ record, expected }) => {
      const item = toAttendanceMonitoringItem(record, EMPLOYEE_BY_ACCOUNT_ID);

      expect(item).toEqual({
        accountId: ACCOUNT_ID,
        employee: { name: EMPLOYEE.name, positionName: EMPLOYEE.positionName },
        ...expected,
      });
      expect(attendanceMonitoringItemSchema.safeParse(item).success).toBe(true);
    },
  );

  it('should show the employee as unavailable when the account is unknown and the day has no check-in', () => {
    const item = toAttendanceMonitoringItem(
      {
        ...PUNCHED_RECORD,
        dayStatusCode: 'PENDING',
        effectiveCheckinAt: null,
        checkinStatusCode: 'PENDING_CHECKIN',
        effectiveCheckoutAt: null,
        checkoutStatusCode: 'PENDING_CHECKOUT',
        rawClockInAt: null,
        rawClockOutAt: null,
      },
      new Map(),
    );

    expect(item.employee).toBeNull();
    expect(item.clockInAt).toBeNull();
  });
});
