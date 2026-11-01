import { z } from 'zod';
import { getDefaultCalendarExceptionRange } from '../utils/calendar-exception-range.js';
import type { BusinessDate } from '../utils/schedule-business-date.js';

const FIRST_PAGE = 1;

const businessDateSchema = z.iso.date();

/**
 * The exception list state in the URL (PRD SCH-5). Each key is optional and an unusable value is dropped (`.catch`), so
 * a stale or hand-edited link still opens the screen. Defaults are applied by resolveCalendarExceptionSearch, not written
 * into the URL. An out-of-order range is kept, so the screen can explain why nothing loaded.
 */
export const calendarExceptionSearchSchema = z.object({
  from: businessDateSchema.optional().catch(undefined),
  to: businessDateSchema.optional().catch(undefined),
  page: z.coerce.number().int().min(FIRST_PAGE).optional().catch(undefined),
});

export type CalendarExceptionSearch = z.infer<typeof calendarExceptionSearchSchema>;

export type ResolvedCalendarExceptionSearch = {
  from: BusinessDate;
  to: BusinessDate;
  page: number;
};

/** Fills the defaults from today. Today is passed in so the function stays pure. */
export function resolveCalendarExceptionSearch(
  search: CalendarExceptionSearch,
  today: BusinessDate,
): ResolvedCalendarExceptionSearch {
  const defaultRange = getDefaultCalendarExceptionRange(today);
  return {
    from: search.from ?? defaultRange.from,
    to: search.to ?? defaultRange.to,
    page: search.page ?? FIRST_PAGE,
  };
}
