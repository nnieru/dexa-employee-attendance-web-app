import { describe, expect, it } from 'vitest';
import { approvalsSearchSchema, resolveApprovalsSearch } from '../types/approvals-search.schema.js';

const TODAY = '2026-11-15';
const EMPLOYEE_ID = '3a7d9c4e-1b2f-4c8a-8d5e-6f7a8b9c0d1e';

describe('approvals search schema', () => {
  it('should keep no keys when the URL names no search state', () => {
    expect(approvalsSearchSchema.parse({})).toEqual({});
  });

  it('should keep a valid tab, status, employee, range, and page', () => {
    expect(
      approvalsSearchSchema.parse({
        tab: 'corrections',
        status: 'APPROVED',
        employeeId: EMPLOYEE_ID,
        from: '2026-10-03',
        to: '2026-10-20',
        page: '4',
      }),
    ).toEqual({
      tab: 'corrections',
      status: 'APPROVED',
      employeeId: EMPLOYEE_ID,
      from: '2026-10-03',
      to: '2026-10-20',
      page: 4,
    });
  });

  it.each([
    ['an unknown tab', { tab: 'leave' }],
    ['an unknown status', { status: 'CANCELLED' }],
    ['a from that is not a date', { from: '2026-02-30' }],
    ['a page of zero', { page: '0' }],
    ['an employee ID that is not a UUID', { employeeId: 'rina' }],
  ])('should drop %s', (_label, rawSearch) => {
    const search = approvalsSearchSchema.parse(rawSearch);

    expect(Object.values(search).every((value) => value === undefined)).toBe(true);
  });
});

describe('resolveApprovalsSearch', () => {
  it('should default to the Overtime tab, Pending status, the WIB month, and page 1', () => {
    expect(resolveApprovalsSearch({}, TODAY)).toEqual({
      tab: 'overtime',
      status: 'PENDING',
      employeeId: undefined,
      from: '2026-11-01',
      to: TODAY,
      page: 1,
    });
  });

  it('should keep every value the URL supplies', () => {
    expect(
      resolveApprovalsSearch(
        {
          tab: 'corrections',
          status: 'REJECTED',
          employeeId: EMPLOYEE_ID,
          from: '2026-10-03',
          to: '2026-10-20',
          page: 4,
        },
        TODAY,
      ),
    ).toEqual({
      tab: 'corrections',
      status: 'REJECTED',
      employeeId: EMPLOYEE_ID,
      from: '2026-10-03',
      to: '2026-10-20',
      page: 4,
    });
  });
});
