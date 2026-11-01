import type { WorkCalendarDateListQuery } from '@dexa/contracts';

// Every calendar exception list starts with `all`, so one invalidation refreshes each range and page.
export const calendarExceptionQueryKeys = {
  all: ['schedule', 'calendar-exceptions'] as const,
  list: (query: WorkCalendarDateListQuery) =>
    [...calendarExceptionQueryKeys.all, 'list', query] as const,
};
