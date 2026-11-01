import {
  workCalendarDatePageSchema,
  type WorkCalendarDateListQuery,
  type WorkCalendarDatePage,
} from '@dexa/contracts';
import { parseResponse } from '@dexa/api-client';
import type { ApiClient } from '@dexa/session';

const WORK_CALENDAR_DATES_PATH = '/work-calendar-dates';

/** One page of calendar exceptions for a range (PRD SCH-5). HR only; the gateway refuses other roles. */
export async function fetchCalendarExceptions(
  apiClient: ApiClient,
  query: WorkCalendarDateListQuery,
): Promise<WorkCalendarDatePage> {
  const response = await apiClient.get<unknown>(WORK_CALENDAR_DATES_PATH, { params: query });
  return parseResponse(workCalendarDatePageSchema, response.data);
}
