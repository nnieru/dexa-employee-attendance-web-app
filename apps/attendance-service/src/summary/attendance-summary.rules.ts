import {
  checkInClassificationSchema,
  checkOutClassificationSchema,
  type AttendanceSummaryItem,
  type AttendanceSummaryPage,
} from '@dexa/contracts';
import type { AttendanceSummaryRecord } from './attendance-summary.repository.interface.js';

/**
 * Maps one stored day to its summary row (PRD SUM-3, SUM-4). The times are the effective ones, and the statuses are
 * the stored codes. A day with no check-out keeps the pending or not-required status it was stored with.
 */
export function toAttendanceSummaryItem(record: AttendanceSummaryRecord): AttendanceSummaryItem {
  // A day row is created by a punch, and the check-in is written in the same transaction (DATABASE §5.4). So a row
  // without one is a broken row. Until a request can create a day without a punch, it is refused, not shown blank.
  if (record.effectiveCheckinAt === null) {
    throw new Error('The attendance day has no effective check-in.');
  }
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

// Without a check-out, the stored code is PENDING_CHECKOUT on a working day or CHECKOUT_NOT_REQUIRED on a day off.
// Any other code with no check-out is a broken row, so it is refused.
function pendingCheckoutStatusCode(
  code: string,
): Extract<AttendanceSummaryItem, { clockOutAt: null }>['clockOutStatus'] {
  if (code === 'PENDING_CHECKOUT' || code === 'CHECKOUT_NOT_REQUIRED') return code;
  throw new Error('The attendance day has no check-out but a classified check-out status.');
}
