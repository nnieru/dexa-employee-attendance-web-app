import {
  workCalendarDateParamSchema,
  workCalendarDateRequestSchema,
  type WorkCalendarDateRequest,
} from '@dexa/contracts';
import type { CalendarExceptionFormValues } from '../types/calendar-exception-form.schema.js';
import type { BusinessDate } from './schedule-business-date.js';
import { toIsWorkingDay } from './calendar-exception-types.js';

export type CalendarExceptionSave = {
  date: BusinessDate;
  request: WorkCalendarDateRequest;
};

/**
 * Builds the save from valid form values and parses it with the shared contract. The form rules already match the
 * contract, so a parse failure means the two drifted apart: it throws instead of sending a guess. The caller catches it
 * and shows a general alert. A blank description is sent as none, because the contract refuses a blank string.
 */
export function toCalendarExceptionSave(
  values: CalendarExceptionFormValues,
): CalendarExceptionSave {
  return {
    date: workCalendarDateParamSchema.parse(values.date),
    request: workCalendarDateRequestSchema.parse({
      isWorkingDay: toIsWorkingDay(values.exceptionType),
      description: toOptionalDescription(values.description),
    }),
  };
}

function toOptionalDescription(description: string): string | undefined {
  const trimmedDescription = description.trim();
  return trimmedDescription.length > 0 ? trimmedDescription : undefined;
}
