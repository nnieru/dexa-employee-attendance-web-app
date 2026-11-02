import type { CorrectionRequest, CorrectionRequestPage } from '@dexa/contracts';
import type { StoredCorrectionRequest } from './correction-request.repository.interface.js';

// clockInAt and clockOutAt are the requested instants, null for a leave outcome. The reviewer's account is not part of
// the response.
export function toCorrectionRequest(request: StoredCorrectionRequest): CorrectionRequest {
  return {
    id: request.id,
    businessDate: request.businessDate,
    requestedDayStatus: request.requestedOutcome,
    clockInAt: request.requestedCheckinAt?.toISOString() ?? null,
    clockOutAt: request.requestedCheckoutAt?.toISOString() ?? null,
    reason: request.reason,
    status: request.status,
    reviewReason: request.reviewReason,
    reviewedAt: request.reviewedAt?.toISOString() ?? null,
    createdAt: request.createdAt.toISOString(),
  };
}

export function toCorrectionRequestPage(
  records: ReadonlyArray<StoredCorrectionRequest>,
  pagination: { readonly page: number; readonly pageSize: number },
  totalItems: number,
): CorrectionRequestPage {
  return {
    items: records.map(toCorrectionRequest),
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / pagination.pageSize),
  };
}
