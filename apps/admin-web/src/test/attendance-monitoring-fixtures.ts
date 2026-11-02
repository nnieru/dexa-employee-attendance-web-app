import type { AttendanceMonitoringItem, AttendanceMonitoringPage } from '@dexa/contracts';

export const ATTENDANCE_MONITORING_URL = '/api/v1/attendance';
export const DEFAULT_TEST_ATTENDANCE_PAGE_SIZE = 20;

// 13 November 01:02 UTC is 08:02 WIB, and 11:30 UTC is 18:30 WIB: the times in the rows are WIB, not UTC.
export const ON_TIME_ROW: AttendanceMonitoringItem = {
  accountId: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13',
  employee: { name: 'Rina Kusuma', positionName: 'Product Analyst' },
  businessDate: '2026-11-13',
  dayStatus: 'PRESENT',
  approvedOvertimeMinutes: 0,
  rawClockInAt: '2026-11-13T01:02:00.000Z',
  rawClockOutAt: '2026-11-13T11:30:00.000Z',
  isCorrected: false,
  clockInAt: '2026-11-13T01:02:00.000Z',
  clockInStatus: 'ON_TIME_CHECKIN',
  clockOutAt: '2026-11-13T11:30:00.000Z',
  clockOutStatus: 'LATE_CHECKOUT',
};

// An approved correction on this day: the effective punches are 08:02 and 19:00 WIB, while the raw punches stay
// 08:10 and 18:30 WIB. The row must show both, because HR needs the raw punch as well as the value in effect.
export const CORRECTED_ROW: AttendanceMonitoringItem = {
  accountId: '9e4c2b7a-5d3f-4a1b-8c6e-0f2d4b6a8c1e',
  employee: { name: 'Siti Rahma', positionName: 'Product Analyst' },
  businessDate: '2026-11-11',
  dayStatus: 'PRESENT',
  approvedOvertimeMinutes: 90.5,
  rawClockInAt: '2026-11-11T01:10:00.000Z',
  rawClockOutAt: '2026-11-11T11:30:00.000Z',
  isCorrected: true,
  clockInAt: '2026-11-11T01:02:00.000Z',
  clockInStatus: 'ON_TIME_CHECKIN',
  clockOutAt: '2026-11-11T12:00:00.000Z',
  clockOutStatus: 'LATE_CHECKOUT',
};

// A day with a late clock in and no clock out yet: the Clock out cell is empty.
export const CLOCK_IN_ONLY_ROW: AttendanceMonitoringItem = {
  accountId: '3a7d9c4e-1b2f-4c8a-8d5e-6f7a8b9c0d1e',
  employee: { name: 'Budi Santoso', positionName: 'Product Analyst' },
  businessDate: '2026-11-14',
  dayStatus: 'PRESENT',
  approvedOvertimeMinutes: 0,
  rawClockInAt: '2026-11-14T02:20:00.000Z',
  rawClockOutAt: null,
  isCorrected: false,
  clockInAt: '2026-11-14T02:20:00.000Z',
  clockInStatus: 'LATE_CHECKIN',
  clockOutAt: null,
  clockOutStatus: 'PENDING_CHECKOUT',
};

// An early day for an account that employee-service does not know: its name is shown as unavailable.
export const UNKNOWN_EMPLOYEE_ROW: AttendanceMonitoringItem = {
  accountId: '7c2e5f8a-9d1b-4e6c-a3f4-0b5c6d7e8f9a',
  employee: null,
  businessDate: '2026-11-12',
  dayStatus: 'PRESENT',
  approvedOvertimeMinutes: 0,
  rawClockInAt: '2026-11-12T00:45:00.000Z',
  rawClockOutAt: '2026-11-12T10:00:00.000Z',
  isCorrected: false,
  clockInAt: '2026-11-12T00:45:00.000Z',
  clockInStatus: 'EARLY_CHECKIN',
  clockOutAt: '2026-11-12T10:00:00.000Z',
  clockOutStatus: 'EARLY_CHECKOUT',
};

// A request created this working day with no punch: the Clock in cell is empty and the status is not recorded yet.
export const NO_CHECK_IN_ROW: AttendanceMonitoringItem = {
  accountId: '2b8f4d1c-6e3a-4f7b-9c2d-8a1e0f5b3c7d',
  employee: { name: 'Dewi Anggraini', positionName: 'Engineer' },
  businessDate: '2026-11-10',
  dayStatus: 'PENDING',
  approvedOvertimeMinutes: 0,
  rawClockInAt: null,
  rawClockOutAt: null,
  isCorrected: false,
  clockInAt: null,
  clockInStatus: 'PENDING_CHECKIN',
  clockOutAt: null,
  clockOutStatus: 'PENDING_CHECKOUT',
};

// A request created this day off with no punch: its check-in and check-out are not required.
export const NO_CHECK_IN_DAY_OFF_ROW: AttendanceMonitoringItem = {
  accountId: '2b8f4d1c-6e3a-4f7b-9c2d-8a1e0f5b3c7d',
  employee: { name: 'Dewi Anggraini', positionName: 'Engineer' },
  businessDate: '2026-11-08',
  dayStatus: 'DAY_OFF',
  approvedOvertimeMinutes: 0,
  rawClockInAt: null,
  rawClockOutAt: null,
  isCorrected: false,
  clockInAt: null,
  clockInStatus: 'CHECKIN_NOT_REQUIRED',
  clockOutAt: null,
  clockOutStatus: 'CHECKOUT_NOT_REQUIRED',
};

export function buildAttendanceMonitoringPage(options: {
  items?: ReadonlyArray<AttendanceMonitoringItem>;
  page?: number;
  totalItems: number;
  pageSize?: number;
}): AttendanceMonitoringPage {
  const pageSize = options.pageSize ?? DEFAULT_TEST_ATTENDANCE_PAGE_SIZE;
  return {
    items: [...(options.items ?? [])],
    page: options.page ?? 1,
    pageSize,
    totalItems: options.totalItems,
    totalPages: Math.ceil(options.totalItems / pageSize),
  };
}
