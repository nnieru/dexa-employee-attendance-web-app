import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../pagination/pagination.schema.js';
import {
  correctionRequestReviewItemSchema,
  correctionRequestReviewPageSchema,
  overtimeRequestReviewItemSchema,
  overtimeRequestReviewPageSchema,
  requestReviewQueueQuerySchema,
} from './request-review-queue.schema.js';

const REQUEST_ID = '3c1f7e2a-9d4b-4a6e-8f0c-5b2d1e9a7c3f';
const REQUESTER_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';

const OVERTIME_ITEM = {
  id: REQUEST_ID,
  businessDate: '2026-11-02',
  startAt: '2026-11-02T11:00:00.000Z',
  endAt: '2026-11-02T13:00:00.000Z',
  reason: 'Release deployment',
  status: 'PENDING',
  reviewReason: null,
  reviewedAt: null,
  createdAt: '2026-11-02T10:00:00.000Z',
  requester: { accountId: REQUESTER_ID, name: 'Nadia Rahma' },
  isOwnRequest: false,
  current: { approvedMinutes: 60 },
};

const CORRECTION_ITEM = {
  id: REQUEST_ID,
  businessDate: '2026-11-02',
  requestedDayStatus: 'PRESENT',
  clockInAt: '2026-11-02T02:05:00.000Z',
  clockOutAt: null,
  reason: 'Forgot to clock in',
  status: 'PENDING',
  reviewReason: null,
  reviewedAt: null,
  createdAt: '2026-11-02T10:00:00.000Z',
  requester: { accountId: REQUESTER_ID, name: null },
  isOwnRequest: true,
  current: { clockInAt: null, clockOutAt: null, dayStatus: 'PENDING' },
};

describe('requestReviewQueueQuerySchema', () => {
  it('should default to the pending status, the first page, and the default size when the query is empty', () => {
    expect(requestReviewQueueQuerySchema.parse({})).toEqual({
      status: 'PENDING',
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    });
  });

  it('should parse every filter from its query-string form', () => {
    expect(
      requestReviewQueueQuerySchema.parse({
        status: 'APPROVED',
        employeeId: REQUESTER_ID,
        from: '2026-11-01',
        to: '2026-11-30',
        page: '2',
        pageSize: '50',
      }),
    ).toEqual({
      status: 'APPROVED',
      employeeId: REQUESTER_ID,
      from: '2026-11-01',
      to: '2026-11-30',
      page: 2,
      pageSize: 50,
    });
  });

  it('should accept a range with only one bound', () => {
    expect(requestReviewQueueQuerySchema.parse({ from: '2026-11-01' })).toMatchObject({
      from: '2026-11-01',
    });
    expect(requestReviewQueueQuerySchema.parse({ to: '2026-11-30' })).toMatchObject({
      to: '2026-11-30',
    });
  });

  it('should accept a range whose two ends are the same day', () => {
    expect(
      requestReviewQueueQuerySchema.safeParse({ from: '2026-11-02', to: '2026-11-02' }).success,
    ).toBe(true);
  });

  it('should accept a page size equal to the maximum', () => {
    expect(requestReviewQueueQuerySchema.parse({ pageSize: String(MAX_PAGE_SIZE) }).pageSize).toBe(
      MAX_PAGE_SIZE,
    );
  });

  it.each([
    { condition: 'status is not a request status', query: { status: 'CANCELLED' } },
    { condition: 'status is blank', query: { status: '' } },
    { condition: 'employeeId is not an account ID', query: { employeeId: 'nadia' } },
    { condition: 'from is not a date', query: { from: '02-11-2026' } },
    { condition: 'from is after to', query: { from: '2026-11-05', to: '2026-11-02' } },
    { condition: 'page is 0', query: { page: '0' } },
    {
      condition: `pageSize is ${MAX_PAGE_SIZE + 1}`,
      query: { pageSize: String(MAX_PAGE_SIZE + 1) },
    },
    { condition: 'the requester is named by accountId', query: { accountId: REQUESTER_ID } },
    { condition: 'an unknown parameter is present', query: { sort: 'createdAt' } },
  ])('should reject the query when $condition', ({ query }) => {
    expect(requestReviewQueueQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('overtimeRequestReviewPageSchema', () => {
  it('should parse a page with the requester, the ownership flag, and the approved minutes', () => {
    const page = {
      items: [OVERTIME_ITEM],
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      totalItems: 1,
      totalPages: 1,
    };

    expect(overtimeRequestReviewPageSchema.parse(page)).toEqual(page);
  });

  it('should accept a requester whose name is unknown', () => {
    const item = { ...OVERTIME_ITEM, requester: { accountId: REQUESTER_ID, name: null } };

    expect(overtimeRequestReviewItemSchema.safeParse(item).success).toBe(true);
  });

  it.each([
    {
      condition: 'the ownership flag is missing',
      item: { ...OVERTIME_ITEM, isOwnRequest: undefined },
    },
    { condition: 'the requester is missing', item: { ...OVERTIME_ITEM, requester: undefined } },
    {
      condition: 'the approved minutes are negative',
      item: { ...OVERTIME_ITEM, current: { approvedMinutes: -1 } },
    },
    {
      condition: 'the status is not a request status',
      item: { ...OVERTIME_ITEM, status: 'CANCELLED' },
    },
  ])('should reject an item when $condition', ({ item }) => {
    expect(overtimeRequestReviewItemSchema.safeParse(item).success).toBe(false);
  });
});

describe('correctionRequestReviewPageSchema', () => {
  it('should parse a page with the current effective times and the day status', () => {
    const page = {
      items: [
        {
          ...CORRECTION_ITEM,
          current: {
            clockInAt: '2026-11-02T02:05:00.000Z',
            clockOutAt: '2026-11-02T11:10:00.000Z',
            dayStatus: 'PRESENT',
          },
        },
      ],
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      totalItems: 1,
      totalPages: 1,
    };

    expect(correctionRequestReviewPageSchema.parse(page)).toEqual(page);
  });

  it('should accept a day with no punch, whose current times are null', () => {
    expect(correctionRequestReviewItemSchema.safeParse(CORRECTION_ITEM).success).toBe(true);
  });

  it.each([
    {
      condition: 'the day status is not a DAY status',
      current: { ...CORRECTION_ITEM.current, dayStatus: 'PENDING_CHECKIN' },
    },
    {
      condition: 'the current clock-in is not an instant',
      current: { ...CORRECTION_ITEM.current, clockInAt: '09:05' },
    },
    { condition: 'the current block is missing', current: undefined },
  ])('should reject an item when $condition', ({ current }) => {
    const item = { ...CORRECTION_ITEM, current };

    expect(correctionRequestReviewItemSchema.safeParse(item).success).toBe(false);
  });
});
