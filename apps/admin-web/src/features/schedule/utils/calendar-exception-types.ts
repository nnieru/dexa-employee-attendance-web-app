import type { StatusLabelProps } from '@dexa/ui';
import type { CalendarExceptionType } from '../types/calendar-exception-form.schema.js';

export const HOLIDAY_LABEL = 'Holiday';
export const SPECIAL_WORKING_DAY_LABEL = 'Special working day';

/** A holiday is a non-working day on a regular working weekday. A special working day is a working day on a regular day off (PRD SCH-5). */
export function toIsWorkingDay(exceptionType: CalendarExceptionType): boolean {
  return exceptionType === 'specialWorkingDay';
}

export function toExceptionType(isWorkingDay: boolean): CalendarExceptionType {
  return isWorkingDay ? 'specialWorkingDay' : 'holiday';
}

export function getCalendarExceptionTypeLabel(isWorkingDay: boolean): string {
  return isWorkingDay ? SPECIAL_WORKING_DAY_LABEL : HOLIDAY_LABEL;
}

export function getCalendarExceptionTypeTone(isWorkingDay: boolean): StatusLabelProps['tone'] {
  return isWorkingDay ? 'neutral' : 'info';
}
