import { MAX_PAGE_SIZE } from '../pagination/pagination.schema.js';
import {
  attendanceSummaryItemSchema,
  attendanceSummaryPageSchema,
  attendanceSummaryQuerySchema,
} from './attendance-summary.schema.js';

const WORKED_DAY = {
  businessDate: '2026-11-02',
  clockInAt: '2026-11-02T02:30:00.000Z',
  clockInStatus: 'LATE_CHECKIN',
  clockOutAt: '2026-11-02T11:00:00.000Z',
  clockOutStatus: 'ON_TIME_CHECKOUT',
};

describe('attendanceSummaryQuerySchema', () => {
  it('should default to the first page of the default size when no query is given', () => {
    expect(attendanceSummaryQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });

  it('should parse the range and the page numbers from their query-string forms', () => {
    expect(
      attendanceSummaryQuerySchema.parse({
        from: '2026-11-01',
        to: '2026-11-30',
        page: '2',
        pageSize: '50',
      }),
    ).toEqual({ from: '2026-11-01', to: '2026-11-30', page: 2, pageSize: 50 });
  });

  it('should accept a page size equal to the maximum', () => {
    expect(attendanceSummaryQuerySchema.parse({ pageSize: String(MAX_PAGE_SIZE) }).pageSize).toBe(
      MAX_PAGE_SIZE,
    );
  });

  it('should accept a range whose two ends are the same day', () => {
    expect(
      attendanceSummaryQuerySchema.parse({ from: '2026-11-02', to: '2026-11-02' }),
    ).toMatchObject({ from: '2026-11-02', to: '2026-11-02' });
  });

  it.each([
    { condition: 'the page size is above the maximum', query: { pageSize: MAX_PAGE_SIZE + 1 } },
    { condition: 'the page size is zero', query: { pageSize: 0 } },
    { condition: 'the page is zero', query: { page: 0 } },
    { condition: 'the page is not a whole number', query: { page: 1.5 } },
    { condition: 'from is not a calendar date', query: { from: '2026-02-30' } },
    { condition: 'from has a time part', query: { from: '2026-11-01T00:00:00Z' } },
    { condition: 'to is in day-month-year order', query: { to: '01-11-2026' } },
    { condition: 'a query parameter is unknown', query: { employeeId: 'x' } },
  ])('should reject the query when $condition', ({ query }) => {
    expect(attendanceSummaryQuerySchema.safeParse(query).success).toBe(false);
  });

  it('should reject the range when from is after to', () => {
    const result = attendanceSummaryQuerySchema.safeParse({ from: '2026-11-03', to: '2026-11-02' });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ['from'], message: 'must not be after to' }),
    ]);
  });
});

describe('attendanceSummaryItemSchema', () => {
  it('should accept a day with both punches', () => {
    expect(attendanceSummaryItemSchema.parse(WORKED_DAY)).toEqual(WORKED_DAY);
  });

  it('should accept a day with only a check-in when the check-out is pending on a working day', () => {
    const day = {
      businessDate: '2026-11-02',
      clockInAt: '2026-11-02T02:30:00.000Z',
      clockInStatus: 'LATE_CHECKIN',
      clockOutAt: null,
      clockOutStatus: 'PENDING_CHECKOUT',
    };

    expect(attendanceSummaryItemSchema.parse(day)).toEqual(day);
  });

  it('should accept a day off with only a check-in, whose check-out is not required', () => {
    const day = {
      businessDate: '2026-11-04',
      clockInAt: '2026-11-04T02:00:00.000Z',
      clockInStatus: 'CHECKIN_NOT_REQUIRED',
      clockOutAt: null,
      clockOutStatus: 'CHECKOUT_NOT_REQUIRED',
    };

    expect(attendanceSummaryItemSchema.parse(day)).toEqual(day);
  });

  it.each([
    {
      condition: 'a request created a working day with no punch',
      day: {
        businessDate: '2026-11-06',
        clockInAt: null,
        clockInStatus: 'PENDING_CHECKIN',
        clockOutAt: null,
        clockOutStatus: 'PENDING_CHECKOUT',
      },
    },
    {
      condition: 'a request created a day off with no punch',
      day: {
        businessDate: '2026-11-07',
        clockInAt: null,
        clockInStatus: 'CHECKIN_NOT_REQUIRED',
        clockOutAt: null,
        clockOutStatus: 'CHECKOUT_NOT_REQUIRED',
      },
    },
  ])('should accept a row with no check-in when $condition', ({ day }) => {
    expect(attendanceSummaryItemSchema.parse(day)).toEqual(day);
  });

  it.each([
    {
      condition: 'the check-out time is set with a pending status',
      day: { ...WORKED_DAY, clockOutStatus: 'PENDING_CHECKOUT' },
    },
    {
      condition: 'the check-in time is null with a classified check-in status',
      day: {
        ...WORKED_DAY,
        clockInAt: null,
        clockInStatus: 'ON_TIME_CHECKIN',
        clockOutAt: null,
        clockOutStatus: 'PENDING_CHECKOUT',
      },
    },
    {
      condition: 'the check-in time is null but the check-out time is set',
      day: { ...WORKED_DAY, clockInAt: null, clockInStatus: 'PENDING_CHECKIN' },
    },
    {
      condition: 'the check-in time is set with a pending check-in status',
      day: { ...WORKED_DAY, clockInStatus: 'PENDING_CHECKIN' },
    },
    {
      condition: 'the check-in time is null with a classified check-out status',
      day: {
        businessDate: '2026-11-06',
        clockInAt: null,
        clockInStatus: 'PENDING_CHECKIN',
        clockOutAt: null,
        clockOutStatus: 'ON_TIME_CHECKOUT',
      },
    },
    {
      condition: 'the check-out time is null with a classified status',
      day: { ...WORKED_DAY, clockOutAt: null },
    },
    {
      condition: 'the check-in status is a check-out value',
      day: { ...WORKED_DAY, clockInStatus: 'LATE_CHECKOUT' },
    },
    {
      condition: 'the check-in instant has a local offset instead of Z',
      day: { ...WORKED_DAY, clockInAt: '2026-11-02T09:30:00+07:00' },
    },
  ])('should reject the row when $condition', ({ day }) => {
    expect(attendanceSummaryItemSchema.safeParse(day).success).toBe(false);
  });
});

describe('attendanceSummaryPageSchema', () => {
  it('should accept the shared page shape with the rows and the totals', () => {
    const page = {
      items: [WORKED_DAY],
      page: 1,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
    };

    expect(attendanceSummaryPageSchema.parse(page)).toEqual(page);
  });
});
