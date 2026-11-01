import type { WorkCalendarDate, WorkCalendarDatePage } from '@dexa/contracts';

export const CALENDAR_EXCEPTIONS_URL = '/api/v1/work-calendar-dates';
export const CALENDAR_EXCEPTION_URL = '/api/v1/work-calendar-dates/:date';

// Today is 15 November 2026 in WIB (see the spec's fake clock), so 15 November is not editable and 16 November is.
export const TODAY_EXCEPTION: WorkCalendarDate = {
  date: '2026-11-15',
  isWorkingDay: false,
  description: 'Past holiday',
};

export const HOLIDAY_EXCEPTION: WorkCalendarDate = {
  date: '2026-11-20',
  isWorkingDay: false,
  description: 'Company holiday',
};

export const SPECIAL_WORKING_DAY_EXCEPTION: WorkCalendarDate = {
  date: '2026-11-28',
  isWorkingDay: true,
  description: null,
};

export const PAST_EXCEPTION: WorkCalendarDate = {
  date: '2026-11-02',
  isWorkingDay: false,
  description: 'Recorded holiday',
};

export function buildCalendarExceptionPage(
  items: ReadonlyArray<WorkCalendarDate>,
  overrides: Partial<
    Pick<WorkCalendarDatePage, 'page' | 'pageSize' | 'totalItems' | 'totalPages'>
  > = {},
): WorkCalendarDatePage {
  return {
    items: [...items],
    page: 1,
    pageSize: 20,
    totalItems: items.length,
    totalPages: items.length > 0 ? 1 : 0,
    ...overrides,
  };
}
