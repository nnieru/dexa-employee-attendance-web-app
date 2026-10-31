import {
  workCalendarDateListQuerySchema,
  workCalendarDateParamSchema,
  workCalendarDatePageSchema,
  workCalendarDateRequestSchema,
  workCalendarDateSchema,
} from './work-calendar-date.schema.js';

const CALENDAR_DATE = { date: '2026-11-09', isWorkingDay: false, description: 'Holiday' };

describe('workCalendarDateSchema', () => {
  it('should accept a calendar date with a description', () => {
    expect(workCalendarDateSchema.parse(CALENDAR_DATE)).toEqual(CALENDAR_DATE);
  });

  it('should accept a calendar date with no description', () => {
    expect(workCalendarDateSchema.parse({ ...CALENDAR_DATE, description: null })).toMatchObject({
      description: null,
    });
  });

  it.each([
    { condition: 'the date has a time part', field: { date: '2026-11-09T00:00' } },
    { condition: 'the date is not a real day', field: { date: '2026-02-30' } },
    { condition: 'isWorkingDay is not a boolean', field: { isWorkingDay: 'no' } },
  ])('should reject the calendar date when $condition', ({ field }) => {
    expect(workCalendarDateSchema.safeParse({ ...CALENDAR_DATE, ...field }).success).toBe(false);
  });
});

describe('workCalendarDatePageSchema', () => {
  it('should accept a page of calendar dates', () => {
    const page = {
      items: [CALENDAR_DATE],
      page: 1,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
    };
    expect(workCalendarDatePageSchema.parse(page)).toEqual(page);
  });
});

describe('workCalendarDateListQuerySchema', () => {
  it('should default the page and page size when only the range is sent', () => {
    expect(workCalendarDateListQuerySchema.parse({ from: '2026-11-01', to: '2026-12-31' })).toEqual(
      { from: '2026-11-01', to: '2026-12-31', page: 1, pageSize: 20 },
    );
  });

  it('should accept a range whose bounds are the same day', () => {
    expect(
      workCalendarDateListQuerySchema.safeParse({ from: '2026-11-09', to: '2026-11-09' }).success,
    ).toBe(true);
  });

  it.each([
    { condition: 'from is missing', query: { to: '2026-12-31' } },
    { condition: 'to is missing', query: { from: '2026-11-01' } },
    { condition: 'from is after to', query: { from: '2026-12-31', to: '2026-11-01' } },
    { condition: 'from is not a date', query: { from: 'November', to: '2026-12-31' } },
    {
      condition: 'pageSize is above the maximum',
      query: { from: '2026-11-01', to: '2026-12-31', pageSize: 101 },
    },
    {
      condition: 'an unknown parameter is sent',
      query: { from: '2026-11-01', to: '2026-12-31', employeeId: 'x' },
    },
  ])('should reject the list query when $condition', ({ query }) => {
    expect(workCalendarDateListQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('workCalendarDateParamSchema', () => {
  it('should accept an ISO calendar date', () => {
    expect(workCalendarDateParamSchema.parse('2026-11-09')).toBe('2026-11-09');
  });

  it.each(['2026-13-01', '09-11-2026', 'next-monday', '2026-11-09T00:00'])(
    'should reject the path value %s',
    (value) => {
      expect(workCalendarDateParamSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe('workCalendarDateRequestSchema', () => {
  it('should accept a request with a description', () => {
    expect(
      workCalendarDateRequestSchema.parse({ isWorkingDay: false, description: 'Holiday' }),
    ).toEqual({ isWorkingDay: false, description: 'Holiday' });
  });

  it('should accept a request with no description', () => {
    expect(workCalendarDateRequestSchema.parse({ isWorkingDay: true })).toEqual({
      isWorkingDay: true,
    });
  });

  it('should trim the description before it is stored', () => {
    expect(
      workCalendarDateRequestSchema.parse({ isWorkingDay: false, description: '  Holiday  ' }),
    ).toEqual({ isWorkingDay: false, description: 'Holiday' });
  });

  it('should accept a description of 255 characters', () => {
    const description = 'a'.repeat(255);
    expect(
      workCalendarDateRequestSchema.safeParse({ isWorkingDay: false, description }).success,
    ).toBe(true);
  });

  it.each([
    { condition: 'isWorkingDay is missing', body: { description: 'Holiday' } },
    { condition: 'isWorkingDay is not a boolean', body: { isWorkingDay: 'false' } },
    { condition: 'the description is blank', body: { isWorkingDay: false, description: '   ' } },
    { condition: 'the description is null', body: { isWorkingDay: false, description: null } },
    {
      condition: 'the description is longer than 255 characters',
      body: { isWorkingDay: false, description: 'a'.repeat(256) },
    },
    { condition: 'the client sends the date', body: { isWorkingDay: false, date: '2026-11-09' } },
  ])('should reject the request when $condition', ({ body }) => {
    expect(workCalendarDateRequestSchema.safeParse(body).success).toBe(false);
  });
});
