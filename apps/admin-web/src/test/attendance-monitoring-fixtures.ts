import type { AttendanceMonitoringItem, AttendanceMonitoringPage } from '@dexa/contracts';

export const ATTENDANCE_MONITORING_URL = '/api/v1/attendance';
export const DEFAULT_TEST_ATTENDANCE_PAGE_SIZE = 20;

// 13 November 01:02 UTC is 08:02 WIB, and 11:30 UTC is 18:30 WIB: the times in the rows are WIB, not UTC.
export const ON_TIME_ROW: AttendanceMonitoringItem = {
  accountId: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13',
  employee: { name: 'Rina Kusuma', positionName: 'Product Analyst' },
  businessDate: '2026-11-13',
  clockInAt: '2026-11-13T01:02:00.000Z',
  clockInStatus: 'ON_TIME_CHECKIN',
  clockOutAt: '2026-11-13T11:30:00.000Z',
  clockOutStatus: 'LATE_CHECKOUT',
};

// A day with a late clock in and no clock out yet: the Clock out cell is empty (PRD ADM-4).
export const CLOCK_IN_ONLY_ROW: AttendanceMonitoringItem = {
  accountId: '3a7d9c4e-1b2f-4c8a-8d5e-6f7a8b9c0d1e',
  employee: { name: 'Budi Santoso', positionName: 'Product Analyst' },
  businessDate: '2026-11-14',
  clockInAt: '2026-11-14T02:20:00.000Z',
  clockInStatus: 'LATE_CHECKIN',
  clockOutAt: null,
  clockOutStatus: 'PENDING_CHECKOUT',
};

// An early day for an account that employee-service does not know: its name is shown as unavailable (ADM-4).
export const UNKNOWN_EMPLOYEE_ROW: AttendanceMonitoringItem = {
  accountId: '7c2e5f8a-9d1b-4e6c-a3f4-0b5c6d7e8f9a',
  employee: null,
  businessDate: '2026-11-12',
  clockInAt: '2026-11-12T00:45:00.000Z',
  clockInStatus: 'EARLY_CHECKIN',
  clockOutAt: '2026-11-12T10:00:00.000Z',
  clockOutStatus: 'EARLY_CHECKOUT',
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
