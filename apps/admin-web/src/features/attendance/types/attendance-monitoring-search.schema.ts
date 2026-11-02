import { z } from 'zod';
import { getMonthStartBusinessDate, type BusinessDate } from '../utils/business-date.js';

const FIRST_PAGE = 1;

const businessDateSchema = z.iso.date();

/**
 * The monitoring state in the URL. Each key is optional and an unusable value is dropped (`.catch`), so a
 * stale or hand-edited link still opens the list. The defaults are applied by resolveAttendanceMonitoringSearch, not
 * written into the URL, so the address stays as short as HR typed it (for example in a sign-in redirect). An
 * out-of-order range is kept: the page reports it, so HR sees why nothing loaded.
 */
export const attendanceMonitoringSearchSchema = z.object({
  from: businessDateSchema.optional().catch(undefined),
  to: businessDateSchema.optional().catch(undefined),
  employeeId: z.uuid().optional().catch(undefined),
  page: z.coerce.number().int().min(FIRST_PAGE).optional().catch(undefined),
});

export type AttendanceMonitoringSearch = z.infer<typeof attendanceMonitoringSearchSchema>;

export type ResolvedAttendanceMonitoringSearch = {
  from: BusinessDate;
  to: BusinessDate;
  employeeId: string | undefined;
  page: number;
};

/**
 * Fills the defaults from today: the range is the first of the WIB month through today (the employee summary's
 * default), and the page is 1. Today is passed in so the function stays pure.
 */
export function resolveAttendanceMonitoringSearch(
  search: AttendanceMonitoringSearch,
  today: BusinessDate,
): ResolvedAttendanceMonitoringSearch {
  return {
    from: search.from ?? getMonthStartBusinessDate(today),
    to: search.to ?? today,
    employeeId: search.employeeId,
    page: search.page ?? FIRST_PAGE,
  };
}
