import type { OvertimeRequest, OvertimeRequestPage } from '@dexa/contracts';
import type { StoredOvertimeRequest } from './overtime-request.repository.interface.js';

// The contract's instants are UTC with a Z suffix. The reviewer's account is not part of the response.
export function toOvertimeRequest(request: StoredOvertimeRequest): OvertimeRequest {
  return {
    id: request.id,
    businessDate: request.businessDate,
    startAt: request.startAt.toISOString(),
    endAt: request.endAt.toISOString(),
    reason: request.reason,
    status: request.status,
    reviewReason: request.reviewReason,
    reviewedAt: request.reviewedAt?.toISOString() ?? null,
    createdAt: request.createdAt.toISOString(),
  };
}

export function toOvertimeRequestPage(
  records: ReadonlyArray<StoredOvertimeRequest>,
  pagination: { readonly page: number; readonly pageSize: number },
  totalItems: number,
): OvertimeRequestPage {
  return {
    items: records.map(toOvertimeRequest),
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / pagination.pageSize),
  };
}
