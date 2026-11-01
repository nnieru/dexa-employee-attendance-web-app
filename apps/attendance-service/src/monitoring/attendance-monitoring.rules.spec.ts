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

// The HR list shows a request-created day with no punch as a row with no clock-in time (D-59).
describe('toAttendanceMonitoringItem', () => {
  it.each<{
    condition: string;
    record: AttendanceMonitoringRecord;
    expectedStatuses: { clockInStatus: string; clockOutStatus: string };
  }>([
    {
      condition: 'a working day has no check-in yet',
      record: {
        accountId: ACCOUNT_ID,
        businessDate: BUSINESS_DATE,
        effectiveCheckinAt: null,
        checkinStatusCode: 'PENDING_CHECKIN',
        effectiveCheckoutAt: null,
        checkoutStatusCode: 'PENDING_CHECKOUT',
      },
      expectedStatuses: { clockInStatus: 'PENDING_CHECKIN', clockOutStatus: 'PENDING_CHECKOUT' },
    },
    {
      condition: 'a day off has no check-in and its check-in is not required',
      record: {
        accountId: ACCOUNT_ID,
        businessDate: BUSINESS_DATE,
        effectiveCheckinAt: null,
        checkinStatusCode: 'CHECKIN_NOT_REQUIRED',
        effectiveCheckoutAt: null,
        checkoutStatusCode: 'CHECKOUT_NOT_REQUIRED',
      },
      expectedStatuses: {
        clockInStatus: 'CHECKIN_NOT_REQUIRED',
        clockOutStatus: 'CHECKOUT_NOT_REQUIRED',
      },
    },
  ])(
    'should map the row with a null clock-in time and the stored statuses when $condition',
    ({ record, expectedStatuses }) => {
      const item = toAttendanceMonitoringItem(record, new Map([[ACCOUNT_ID, EMPLOYEE]]));

      expect(item).toEqual({
        accountId: ACCOUNT_ID,
        employee: { name: EMPLOYEE.name, positionName: EMPLOYEE.positionName },
        businessDate: BUSINESS_DATE,
        clockInAt: null,
        clockInStatus: expectedStatuses.clockInStatus,
        clockOutAt: null,
        clockOutStatus: expectedStatuses.clockOutStatus,
      });
      expect(attendanceMonitoringItemSchema.safeParse(item).success).toBe(true);
    },
  );

  it('should show the employee as unavailable when the account is unknown and the day has no check-in', () => {
    const item = toAttendanceMonitoringItem(
      {
        accountId: ACCOUNT_ID,
        businessDate: BUSINESS_DATE,
        effectiveCheckinAt: null,
        checkinStatusCode: 'PENDING_CHECKIN',
        effectiveCheckoutAt: null,
        checkoutStatusCode: 'PENDING_CHECKOUT',
      },
      new Map(),
    );

    expect(item.employee).toBeNull();
    expect(item.clockInAt).toBeNull();
  });
});
