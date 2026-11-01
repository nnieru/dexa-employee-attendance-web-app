import {
  checkInClassificationSchema,
  checkOutClassificationSchema,
  type AttendanceSummaryItem,
  type AttendanceSummaryPage,
} from '@dexa/contracts';
import type { AttendanceSummaryRecord } from './attendance-summary.repository.interface.js';

/**
 * Maps one stored day to its summary row (PRD SUM-3, SUM-4). The times are the effective ones, and the statuses are
 * the stored codes. A day with no check-in or no check-out keeps the pending or not-required status it was stored with.
 */
export function toAttendanceSummaryItem(record: AttendanceSummaryRecord): AttendanceSummaryItem {
  if (record.effectiveCheckinAt === null) return toNoCheckInItem(record);
  const base = {
    businessDate: record.businessDate,
    clockInAt: record.effectiveCheckinAt.toISOString(),
    clockInStatus: checkInClassificationSchema.parse(record.checkinStatusCode),
  };
  if (record.effectiveCheckoutAt === null) {
    return {
      ...base,
      clockOutAt: null,
      clockOutStatus: pendingCheckoutStatusCode(record.checkoutStatusCode),
    };
  }
  return {
    ...base,
    clockOutAt: record.effectiveCheckoutAt.toISOString(),
    clockOutStatus: checkOutClassificationSchema.parse(record.checkoutStatusCode),
  };
}

export function toAttendanceSummaryPage(
  items: ReadonlyArray<AttendanceSummaryItem>,
  pagination: { readonly page: number; readonly pageSize: number },
  totalItems: number,
): AttendanceSummaryPage {
  return {
    items: [...items],
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / pagination.pageSize),
  };
}

// A day that a request created has no punch, so it has no check-in time (DATABASE §5.4, D-59). A check-out without a
// check-in is a broken row, which the database also refuses, so it is refused here too.
function toNoCheckInItem(
  record: AttendanceSummaryRecord,
): Extract<AttendanceSummaryItem, { clockInAt: null }> {
  if (record.effectiveCheckoutAt !== null) {
    throw new Error('The attendance day has a check-out but no check-in.');
  }
  return {
    businessDate: record.businessDate,
    clockInAt: null,
    clockInStatus: pendingCheckinStatusCode(record.checkinStatusCode),
    clockOutAt: null,
    clockOutStatus: pendingCheckoutStatusCode(record.checkoutStatusCode),
  };
}

// Without a check-in, the stored code is PENDING_CHECKIN on a working day or CHECKIN_NOT_REQUIRED on a day off.
// Any other code with no check-in is a broken row, so it is refused.
function pendingCheckinStatusCode(
  code: string,
): Extract<AttendanceSummaryItem, { clockInAt: null }>['clockInStatus'] {
  if (code === 'PENDING_CHECKIN' || code === 'CHECKIN_NOT_REQUIRED') return code;
  throw new Error('The attendance day has no check-in but a classified check-in status.');
}

// Without a check-out, the stored code is PENDING_CHECKOUT on a working day or CHECKOUT_NOT_REQUIRED on a day off.
// Any other code with no check-out is a broken row, so it is refused.
function pendingCheckoutStatusCode(
  code: string,
): Extract<AttendanceSummaryItem, { clockOutAt: null }>['clockOutStatus'] {
  if (code === 'PENDING_CHECKOUT' || code === 'CHECKOUT_NOT_REQUIRED') return code;
  throw new Error('The attendance day has no check-out but a classified check-out status.');
}
