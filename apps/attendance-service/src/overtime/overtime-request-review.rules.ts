import type { OvertimeRequestReviewItem, OvertimeRequestReviewPage } from '@dexa/contracts';
import { toOvertimeRequest } from './overtime-request.rules.js';
import type { StoredOvertimeReviewRequest } from './overtime-request-review.repository.interface.js';

// The requester is shown by name, or unnamed when Employee does not know the account. The reviewer's account is never
// returned; only the ownership flag that the UI needs to disable self-review.
export function toOvertimeRequestReviewItem(
  record: StoredOvertimeReviewRequest,
  reviewerAccountId: string,
  nameByAccountId: ReadonlyMap<string, string>,
): OvertimeRequestReviewItem {
  return {
    ...toOvertimeRequest(record),
    requester: {
      accountId: record.requesterAccountId,
      name: nameByAccountId.get(record.requesterAccountId) ?? null,
    },
    isOwnRequest: record.requesterAccountId === reviewerAccountId,
    current: { approvedMinutes: record.approvedMinutes },
  };
}

export function toOvertimeRequestReviewPage(
  items: ReadonlyArray<OvertimeRequestReviewItem>,
  pagination: { readonly page: number; readonly pageSize: number },
  totalItems: number,
): OvertimeRequestReviewPage {
  return {
    items: [...items],
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / pagination.pageSize),
  };
}
