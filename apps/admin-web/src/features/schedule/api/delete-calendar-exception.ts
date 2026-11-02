import type { ApiClient } from '@dexa/session';

const WORK_CALENDAR_DATES_PATH = '/work-calendar-dates';

/** Removes the exception for one date. Refused with 409 for a date that is not after today in WIB. */
export async function deleteCalendarException(apiClient: ApiClient, date: string): Promise<void> {
  await apiClient.delete(`${WORK_CALENDAR_DATES_PATH}/${encodeURIComponent(date)}`);
}
