import type { BusinessDate } from '@dexa/common';
import type {
  WorkCalendarDatePage,
  WorkCalendarDateListQuery,
  WorkCalendarDateRequest,
} from '@dexa/contracts';
import { nextBusinessDate } from '../schedules/work-schedule.rules.js';
import type {
  NewWorkCalendarDate,
  WorkCalendarDateRecordPage,
} from './work-calendar-date.repository.interface.js';

/**
 * Only a date after the business date can change. Business dates are YYYY-MM-DD, so string order is
 * calendar order, and the first editable date is the day after today.
 */
export function isCalendarDateEditable(date: BusinessDate, businessDate: BusinessDate): boolean {
  return date >= nextBusinessDate(businessDate);
}

/**
 * The stored values of one exception. The date comes from the route, and the request is copied field by field, so
 * an unknown field can never reach the table. An absent description is stored as null.
 */
export function buildWorkCalendarDateValues(
  date: BusinessDate,
  request: WorkCalendarDateRequest,
): NewWorkCalendarDate {
  return {
    date,
    isWorkingDay: request.isWorkingDay,
    description: request.description ?? null,
  };
}

export function buildWorkCalendarDatePage(
  recordPage: WorkCalendarDateRecordPage,
  pagination: Pick<WorkCalendarDateListQuery, 'page' | 'pageSize'>,
): WorkCalendarDatePage {
  return {
    items: [...recordPage.dates],
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalItems: recordPage.totalItems,
    totalPages: Math.ceil(recordPage.totalItems / pagination.pageSize),
  };
}
