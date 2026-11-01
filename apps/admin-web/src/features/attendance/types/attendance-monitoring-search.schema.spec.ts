import { describe, expect, it } from 'vitest';
import {
  attendanceMonitoringSearchSchema,
  resolveAttendanceMonitoringSearch,
} from './attendance-monitoring-search.schema.js';

const TODAY = '2026-11-15';
const EMPLOYEE_ID = '3a7d9c4e-1b2f-4c8a-8d5e-6f7a8b9c0d1e';

describe('attendance monitoring search schema', () => {
  it('should keep no keys when the URL names no search state, so the address is not rewritten', () => {
    expect(attendanceMonitoringSearchSchema.parse({})).toEqual({});
  });

  it('should keep a valid range, employee, and page from the URL', () => {
    expect(
      attendanceMonitoringSearchSchema.parse({
        from: '2026-10-03',
        to: '2026-10-20',
        employeeId: EMPLOYEE_ID,
        page: '4',
      }),
    ).toEqual({ from: '2026-10-03', to: '2026-10-20', employeeId: EMPLOYEE_ID, page: 4 });
  });

  it.each([
    ['a from that is not a date', { from: '2026-02-30' }],
    ['a to that is not a date', { to: 'soon' }],
    ['a page of zero', { page: '0' }],
    ['a page that is not a number', { page: 'two' }],
    ['a fractional page', { page: '2.5' }],
    ['an employee ID that is not a UUID', { employeeId: 'rina' }],
    ['an empty employee ID', { employeeId: '' }],
  ])('should drop %s', (_label, rawSearch) => {
    const search = attendanceMonitoringSearchSchema.parse(rawSearch);

    expect(Object.values(search).every((value) => value === undefined)).toBe(true);
  });
});

describe('resolveAttendanceMonitoringSearch', () => {
  it('should default from to the first of the WIB month, to to today, and page to 1 when the URL is empty', () => {
    expect(resolveAttendanceMonitoringSearch({}, TODAY)).toEqual({
      from: '2026-11-01',
      to: TODAY,
      employeeId: undefined,
      page: 1,
    });
  });

  it('should keep a valid range, employee, and page from the URL', () => {
    expect(
      resolveAttendanceMonitoringSearch(
        { from: '2026-10-03', to: '2026-10-20', employeeId: EMPLOYEE_ID, page: 4 },
        TODAY,
      ),
    ).toEqual({ from: '2026-10-03', to: '2026-10-20', employeeId: EMPLOYEE_ID, page: 4 });
  });

  it('should default a single missing bound without changing the other', () => {
    expect(resolveAttendanceMonitoringSearch({ from: '2026-09-01' }, TODAY)).toEqual(
      expect.objectContaining({ from: '2026-09-01', to: TODAY }),
    );
    expect(resolveAttendanceMonitoringSearch({ to: '2026-10-31' }, TODAY)).toEqual(
      expect.objectContaining({ from: '2026-11-01', to: '2026-10-31' }),
    );
  });

  it('should keep an out-of-order range so the page can explain it', () => {
    expect(
      resolveAttendanceMonitoringSearch({ from: '2026-11-10', to: '2026-11-01' }, TODAY),
    ).toEqual(expect.objectContaining({ from: '2026-11-10', to: '2026-11-01' }));
  });

  it('should default from to the same day when today is the first day of the month', () => {
    expect(resolveAttendanceMonitoringSearch({}, '2026-12-01')).toEqual(
      expect.objectContaining({ from: '2026-12-01', to: '2026-12-01' }),
    );
  });
});
