import { workCalendarDateSchema, type WorkCalendarDate } from '@dexa/contracts';
import { parseResponse } from '@dexa/api-client';
import type { ApiClient } from '@dexa/session';
import type { CalendarExceptionSave } from '../utils/to-calendar-exception-save.js';

const WORK_CALENDAR_DATES_PATH = '/work-calendar-dates';

/**
 * Stores the exception for one date (PRD SCH-5). The service replaces any exception already on that date, and refuses
 * a date that is not after today in WIB with 409. The save is not retried: a lost answer may hide a stored change.
 */
export async function saveCalendarException(
  apiClient: ApiClient,
  save: CalendarExceptionSave,
): Promise<WorkCalendarDate> {
  const response = await apiClient.put<unknown>(
    `${WORK_CALENDAR_DATES_PATH}/${encodeURIComponent(save.date)}`,
    save.request,
  );
  return parseResponse(workCalendarDateSchema, response.data);
}
