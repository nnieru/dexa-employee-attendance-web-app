import type { CorrectionRequestReviewItem, CorrectionRequestReviewPage } from '@dexa/contracts';
import { toCorrectionRequest } from './correction-request.rules.js';
import type { StoredCorrectionReviewRequest } from './correction-request-review.repository.interface.js';

// The requester is shown by name, or unnamed when Employee does not know the account. The reviewer's account is never
// returned; only the ownership flag that the UI needs to disable self-review (APR-4).
export function toCorrectionRequestReviewItem(
  record: StoredCorrectionReviewRequest,
  reviewerAccountId: string,
  nameByAccountId: ReadonlyMap<string, string>,
): CorrectionRequestReviewItem {
  return {
    ...toCorrectionRequest(record),
    requester: {
      accountId: record.requesterAccountId,
      name: nameByAccountId.get(record.requesterAccountId) ?? null,
    },
    isOwnRequest: record.requesterAccountId === reviewerAccountId,
    current: {
      clockInAt: record.currentCheckinAt?.toISOString() ?? null,
      clockOutAt: record.currentCheckoutAt?.toISOString() ?? null,
      dayStatus: record.currentDayStatus,
    },
  };
}

export function toCorrectionRequestReviewPage(
  items: ReadonlyArray<CorrectionRequestReviewItem>,
  pagination: { readonly page: number; readonly pageSize: number },
  totalItems: number,
): CorrectionRequestReviewPage {
  return {
    items: [...items],
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / pagination.pageSize),
  };
}
