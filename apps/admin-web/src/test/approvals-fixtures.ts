import type {
  CorrectionRequest,
  CorrectionRequestReviewItem,
  CorrectionRequestReviewPage,
  OvertimeRequest,
  OvertimeRequestReviewItem,
  OvertimeRequestReviewPage,
} from '@dexa/contracts';
import { DEFAULT_PAGE_SIZE } from '@dexa/contracts';
import { HttpResponse, http, type HttpHandler } from 'msw';
import { HR_ACCOUNT } from './admin-app-harness.js';
import { RINA } from './employee-list-fixtures.js';

export const OVERTIME_REQUESTS_URL = '/api/v1/overtime-requests';
export const CORRECTION_REQUESTS_URL = '/api/v1/attendance-corrections';

// The requester the HR user reviews most. The own request carries the signed-in HR account, so the screen must forbid
// reviewing it (APR-4).
export const RINA_REQUESTER = { accountId: RINA.accountId, name: RINA.name };
export const SARI_REQUESTER = { accountId: HR_ACCOUNT.id, name: 'Sari Wulandari' };

/** One row of the overtime review queue (PRD APR-1), shaped like the contract. */
export function buildOvertimeReviewItem({
  id,
  ...overrides
}: Pick<OvertimeRequestReviewItem, 'id'> &
  Partial<OvertimeRequestReviewItem>): OvertimeRequestReviewItem {
  return {
    id,
    businessDate: '2026-11-12',
    // 17:00–19:00 WIB. The server stores the instant; the screen renders the WIB time (OT-1, APR-1).
    startAt: '2026-11-12T10:00:00.000Z',
    endAt: '2026-11-12T12:00:00.000Z',
    reason: 'The client visit ran past office hours.',
    status: 'PENDING',
    reviewReason: null,
    reviewedAt: null,
    createdAt: '2026-11-12T10:30:00.000Z',
    requester: RINA_REQUESTER,
    isOwnRequest: false,
    current: { approvedMinutes: 0 },
    ...overrides,
  };
}

export const PENDING_OVERTIME = buildOvertimeReviewItem({
  id: 'e2b1c4a0-7d3e-4b9a-8c1d-0e2f4a6b8c0d',
});

export const OWN_PENDING_OVERTIME = buildOvertimeReviewItem({
  id: 'b4a8e1c7-2d5f-4e9b-8a3c-1f2e6d7b9c4a',
  requester: SARI_REQUESTER,
  isOwnRequest: true,
  reason: 'The payroll close kept me in the office.',
});

export const APPROVED_OVERTIME = buildOvertimeReviewItem({
  id: '5c9d2b6f-8e4a-4c1f-9b7d-0a3e5f8b2c1d',
  status: 'APPROVED',
  reviewReason: 'Matches the manager approval.',
  reviewedAt: '2026-11-14T01:00:00.000Z',
});

export const REJECTED_OVERTIME = buildOvertimeReviewItem({
  id: '2e7a4f1b-3c6d-4b8e-9f5a-6b1d8c2e7f3a',
  status: 'REJECTED',
  reviewReason: 'Not approved by the team lead.',
  reviewedAt: '2026-11-14T01:30:00.000Z',
});

/** One row of the correction review queue (PRD APR-1), shaped like the contract. */
export function buildCorrectionReviewItem({
  id,
  ...overrides
}: Pick<CorrectionRequestReviewItem, 'id'> &
  Partial<CorrectionRequestReviewItem>): CorrectionRequestReviewItem {
  return {
    id,
    businessDate: '2026-11-13',
    requestedDayStatus: 'PRESENT',
    // 08:00–17:00 WIB requested. The day has no punch yet, so the current values are empty.
    clockInAt: '2026-11-13T01:00:00.000Z',
    clockOutAt: null,
    reason: 'I forgot to punch in that morning.',
    status: 'PENDING',
    reviewReason: null,
    reviewedAt: null,
    createdAt: '2026-11-13T04:00:00.000Z',
    requester: RINA_REQUESTER,
    isOwnRequest: false,
    current: { dayStatus: 'PENDING', clockInAt: null, clockOutAt: null },
    ...overrides,
  };
}

export const PENDING_CORRECTION = buildCorrectionReviewItem({
  id: '7b2f4d8a-1c3e-4f6b-9d5c-2e8a0b4f6d7c',
});

/**
 * The bare request the decision endpoint answers with (APR-2): the requester, current values, and the self-review flag
 * are review-queue data, not the stored request record.
 */
export function toOvertimeRequest(item: OvertimeRequestReviewItem): OvertimeRequest {
  return {
    id: item.id,
    businessDate: item.businessDate,
    startAt: item.startAt,
    endAt: item.endAt,
    reason: item.reason,
    status: item.status,
    reviewReason: item.reviewReason,
    reviewedAt: item.reviewedAt,
    createdAt: item.createdAt,
  };
}

/** The bare correction record the decision endpoint answers with, the same projection as for overtime. */
export function toCorrectionRequest(item: CorrectionRequestReviewItem): CorrectionRequest {
  return {
    id: item.id,
    businessDate: item.businessDate,
    requestedDayStatus: item.requestedDayStatus,
    clockInAt: item.clockInAt,
    clockOutAt: item.clockOutAt,
    reason: item.reason,
    status: item.status,
    reviewReason: item.reviewReason,
    reviewedAt: item.reviewedAt,
    createdAt: item.createdAt,
  };
}

export function buildOvertimeReviewPage(options: {
  items?: ReadonlyArray<OvertimeRequestReviewItem>;
  page?: number;
  totalItems: number;
}): OvertimeRequestReviewPage {
  const page = options.page ?? 1;
  return {
    items: [...(options.items ?? [])],
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    totalItems: options.totalItems,
    totalPages: Math.ceil(options.totalItems / DEFAULT_PAGE_SIZE),
  };
}

export function buildCorrectionReviewPage(options: {
  items?: ReadonlyArray<CorrectionRequestReviewItem>;
  page?: number;
  totalItems: number;
}): CorrectionRequestReviewPage {
  const page = options.page ?? 1;
  return {
    items: [...(options.items ?? [])],
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    totalItems: options.totalItems,
    totalPages: Math.ceil(options.totalItems / DEFAULT_PAGE_SIZE),
  };
}

/** A queue handler that answers every overtime list request with the given page. */
export function overtimeQueueSucceeds(page: OvertimeRequestReviewPage): HttpHandler {
  return http.get(OVERTIME_REQUESTS_URL, () => HttpResponse.json(page));
}

/** A queue handler that answers every correction list request with the given page. */
export function correctionQueueSucceeds(page: CorrectionRequestReviewPage): HttpHandler {
  return http.get(CORRECTION_REQUESTS_URL, () => HttpResponse.json(page));
}

/** A detail handler that answers the overtime review request with the given item. */
export function overtimeDetailSucceeds(item: OvertimeRequestReviewItem): HttpHandler {
  return http.get(`${OVERTIME_REQUESTS_URL}/:id`, () => HttpResponse.json(item));
}

/** A detail handler that answers the correction review request with the given item. */
export function correctionDetailSucceeds(item: CorrectionRequestReviewItem): HttpHandler {
  return http.get(`${CORRECTION_REQUESTS_URL}/:id`, () => HttpResponse.json(item));
}
