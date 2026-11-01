import { MAX_PAGE_SIZE } from '../pagination/pagination.schema.js';
import {
  attendanceMonitoringItemSchema,
  attendanceMonitoringPageSchema,
  attendanceMonitoringQuerySchema,
} from './attendance-monitoring.schema.js';

const ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';

const MONITORED_DAY = {
  accountId: ACCOUNT_ID,
  employee: { name: 'Nadia Rahma', positionName: 'Fullstack Developer' },
  businessDate: '2026-11-02',
  dayStatus: 'PRESENT',
  approvedOvertimeMinutes: 0,
  rawClockInAt: '2026-11-02T02:30:00.000Z',
  rawClockOutAt: '2026-11-02T11:00:00.000Z',
  isCorrected: false,
  clockInAt: '2026-11-02T02:30:00.000Z',
  clockInStatus: 'LATE_CHECKIN',
  clockOutAt: '2026-11-02T11:00:00.000Z',
  clockOutStatus: 'ON_TIME_CHECKOUT',
};

// A correction moved both effective times, and the raw punches stay as the employee made them (ADM-4).
const CORRECTED_DAY = {
  ...MONITORED_DAY,
  rawClockInAt: '2026-11-02T03:10:00.000Z',
  rawClockOutAt: null,
  isCorrected: true,
  clockInAt: '2026-11-02T02:20:00.000Z',
  clockInStatus: 'ON_TIME_CHECKIN',
  clockOutAt: '2026-11-02T10:00:00.000Z',
  clockOutStatus: 'EARLY_CHECKOUT',
};

// Drops one field from a row, so a test can show the schema refuses a row that lacks it.
function omit(day: Record<string, unknown>, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(day).filter(([name]) => name !== key));
}

describe('attendanceMonitoringQuerySchema', () => {
  it('should default to the first page of the default size when no query is given', () => {
    expect(attendanceMonitoringQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });

  it('should parse the range, the employee, and the page numbers from their query-string forms', () => {
    expect(
      attendanceMonitoringQuerySchema.parse({
        from: '2026-11-01',
        to: '2026-11-30',
        employeeId: ACCOUNT_ID,
        page: '2',
        pageSize: '50',
      }),
    ).toEqual({
      from: '2026-11-01',
      to: '2026-11-30',
      employeeId: ACCOUNT_ID,
      page: 2,
      pageSize: 50,
    });
  });

  it.each([
    { condition: 'the page size is above the maximum', query: { pageSize: MAX_PAGE_SIZE + 1 } },
    { condition: 'the employee ID is not a UUID', query: { employeeId: 'nadia' } },
    { condition: 'from is not a calendar date', query: { from: '2026-02-30' } },
    { condition: 'a query parameter is unknown', query: { name: 'Nadia' } },
  ])('should reject the query when $condition', ({ query }) => {
    expect(attendanceMonitoringQuerySchema.safeParse(query).success).toBe(false);
  });

  it('should reject the range when from is after to', () => {
    const result = attendanceMonitoringQuerySchema.safeParse({
      from: '2026-11-03',
      to: '2026-11-02',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ['from'], message: 'must not be after to' }),
    ]);
  });
});

describe('attendanceMonitoringItemSchema', () => {
  it('should accept a day with the employee name and position', () => {
    expect(attendanceMonitoringItemSchema.parse(MONITORED_DAY)).toEqual(MONITORED_DAY);
  });

  it('should accept a day whose employee is unavailable', () => {
    const day = { ...MONITORED_DAY, employee: null };

    expect(attendanceMonitoringItemSchema.parse(day)).toEqual(day);
  });

  it('should accept a corrected day with its raw punches next to the effective ones', () => {
    expect(attendanceMonitoringItemSchema.parse(CORRECTED_DAY)).toEqual(CORRECTED_DAY);
  });

  it('should accept a day with no punch, such as an approved leave, whose raw punches are null', () => {
    const day = {
      ...MONITORED_DAY,
      dayStatus: 'SICK_LEAVE',
      rawClockInAt: null,
      rawClockOutAt: null,
      isCorrected: true,
      clockInAt: null,
      clockInStatus: 'CHECKIN_NOT_REQUIRED',
      clockOutAt: null,
      clockOutStatus: 'CHECKOUT_NOT_REQUIRED',
    };

    expect(attendanceMonitoringItemSchema.parse(day)).toEqual(day);
  });

  it.each([
    { condition: 'the account ID is missing', day: { ...MONITORED_DAY, accountId: undefined } },
    {
      condition: 'the check-out time is null with a classified status',
      day: { ...MONITORED_DAY, clockOutAt: null },
    },
    { condition: 'the raw clock-in is missing', day: omit(MONITORED_DAY, 'rawClockInAt') },
    { condition: 'the raw clock-out is missing', day: omit(MONITORED_DAY, 'rawClockOutAt') },
    { condition: 'the isCorrected flag is missing', day: omit(MONITORED_DAY, 'isCorrected') },
    {
      condition: 'the isCorrected flag is not a boolean',
      day: { ...MONITORED_DAY, isCorrected: 'false' },
    },
    { condition: 'the day status is missing', day: omit(MONITORED_DAY, 'dayStatus') },
    {
      condition: 'the approved overtime minutes are missing',
      day: omit(MONITORED_DAY, 'approvedOvertimeMinutes'),
    },
    {
      condition: 'the raw clock-in has a local offset instead of Z',
      day: { ...MONITORED_DAY, rawClockInAt: '2026-11-02T09:30:00+07:00' },
    },
  ])('should reject the row when $condition', ({ day }) => {
    expect(attendanceMonitoringItemSchema.safeParse(day).success).toBe(false);
  });
});

describe('attendanceMonitoringPageSchema', () => {
  it('should accept the shared page shape with the rows and the totals', () => {
    const page = { items: [MONITORED_DAY], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 };

    expect(attendanceMonitoringPageSchema.parse(page)).toEqual(page);
  });
});
