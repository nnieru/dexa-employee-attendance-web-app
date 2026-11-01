import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../pagination/pagination.schema.js';
import {
  correctionRequestPageSchema,
  ownRequestListQuerySchema,
  overtimeRequestPageSchema,
} from './request-list.schema.js';

const OVERTIME_ITEM = {
  id: '3c1f7e2a-9d4b-4a6e-8f0c-5b2d1e9a7c3f',
  businessDate: '2026-11-02',
  startAt: '2026-11-02T11:00:00.000Z',
  endAt: '2026-11-02T13:00:00.000Z',
  reason: 'Release deployment',
  status: 'APPROVED',
  reviewReason: null,
  reviewedAt: '2026-11-02T12:00:00.000Z',
  createdAt: '2026-11-02T10:00:00.000Z',
};

const CORRECTION_ITEM = {
  id: '7d2e9c1b-4f3a-4b8e-9a0d-6c5e4f3b2a1d',
  businessDate: '2026-11-02',
  requestedDayStatus: 'LEAVE',
  clockInAt: null,
  clockOutAt: null,
  reason: 'Fever, doctor note on file',
  status: 'REJECTED',
  reviewReason: 'Attach the note to HR first',
  reviewedAt: '2026-11-02T12:00:00.000Z',
  createdAt: '2026-11-02T10:00:00.000Z',
};

describe('ownRequestListQuerySchema', () => {
  it('should default to the first page of the default size with no status filter when the query is empty', () => {
    expect(ownRequestListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    });
  });

  it.each(['PENDING', 'APPROVED', 'REJECTED'])(
    'should parse the status %s from the query string',
    (status) => {
      expect(ownRequestListQuerySchema.parse({ status, page: '2', pageSize: '5' })).toEqual({
        status,
        page: 2,
        pageSize: 5,
      });
    },
  );

  it('should accept a page size equal to the maximum', () => {
    expect(ownRequestListQuerySchema.parse({ pageSize: String(MAX_PAGE_SIZE) }).pageSize).toBe(
      MAX_PAGE_SIZE,
    );
  });

  it.each([
    { condition: 'status is not a request status', query: { status: 'CANCELLED' } },
    { condition: 'status is blank', query: { status: '' } },
    { condition: 'page is 0', query: { page: '0' } },
    {
      condition: `pageSize is ${MAX_PAGE_SIZE + 1}`,
      query: { pageSize: String(MAX_PAGE_SIZE + 1) },
    },
    { condition: 'an account ID is present', query: { accountId: 'other-account' } },
    { condition: 'an unknown parameter is present', query: { sort: 'createdAt' } },
  ])('should reject the query when $condition', ({ query }) => {
    expect(ownRequestListQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('overtimeRequestPageSchema', () => {
  it('should parse a page of requests with their reviewer reason and decision time', () => {
    const page = {
      items: [OVERTIME_ITEM],
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      totalItems: 1,
      totalPages: 1,
    };

    expect(overtimeRequestPageSchema.parse(page)).toEqual(page);
  });

  it('should reject a page whose item lacks the decision time field', () => {
    const itemWithoutDecisionTime = { ...OVERTIME_ITEM, reviewedAt: undefined };

    expect(
      overtimeRequestPageSchema.safeParse({
        items: [itemWithoutDecisionTime],
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
        totalItems: 1,
        totalPages: 1,
      }).success,
    ).toBe(false);
  });
});

describe('correctionRequestPageSchema', () => {
  it('should parse a page of corrections with their reviewer reason and decision time', () => {
    const page = {
      items: [CORRECTION_ITEM],
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      totalItems: 1,
      totalPages: 1,
    };

    expect(correctionRequestPageSchema.parse(page)).toEqual(page);
  });

  it('should reject a page whose item holds a status that no stored request holds', () => {
    expect(
      correctionRequestPageSchema.safeParse({
        items: [{ ...CORRECTION_ITEM, status: 'CANCELLED' }],
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
        totalItems: 1,
        totalPages: 1,
      }).success,
    ).toBe(false);
  });
});
