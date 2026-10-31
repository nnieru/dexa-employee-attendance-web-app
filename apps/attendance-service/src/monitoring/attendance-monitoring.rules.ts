import type {
  AttendanceMonitoringItem,
  AttendanceMonitoringPage,
  EmployeeLookupItem,
} from '@dexa/contracts';
import { toAttendanceSummaryItem } from '../summary/attendance-summary.rules.js';
import type { AttendanceMonitoringRecord } from './attendance-monitoring.repository.interface.js';

/** The distinct accounts on one page, so the page needs one lookup of at most its page size. */
export function getDistinctAccountIds(
  records: ReadonlyArray<AttendanceMonitoringRecord>,
): string[] {
  return [...new Set(records.map((record) => record.accountId))];
}

/**
 * Maps one stored day to its HR row (PRD ADM-4). The day fields follow the own summary. An account that Employee
 * does not know is shown as unavailable (null), so one missing profile never fails the page (DATABASE §8).
 */
export function toAttendanceMonitoringItem(
  record: AttendanceMonitoringRecord,
  employeeByAccountId: ReadonlyMap<string, EmployeeLookupItem>,
): AttendanceMonitoringItem {
  const employee = employeeByAccountId.get(record.accountId);
  return {
    accountId: record.accountId,
    employee:
      employee === undefined ? null : { name: employee.name, positionName: employee.positionName },
    ...toAttendanceSummaryItem(record),
  };
}

export function toAttendanceMonitoringPage(
  items: ReadonlyArray<AttendanceMonitoringItem>,
  pagination: { readonly page: number; readonly pageSize: number },
  totalItems: number,
): AttendanceMonitoringPage {
  return {
    items: [...items],
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / pagination.pageSize),
  };
}
