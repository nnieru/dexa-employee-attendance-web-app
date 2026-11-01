import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { WorkCalendarDate } from '@dexa/contracts';
import { useSession } from '@dexa/session';
import { calendarExceptionQueryKeys } from '../api/calendar-exception-query-keys.js';
import { saveCalendarException } from '../api/save-calendar-exception.js';
import type { CalendarExceptionSave } from '../utils/to-calendar-exception-save.js';

/**
 * Stores one exception. Whether it succeeds or is refused (for example 409 for a date that is no longer future), the
 * list is refetched, so HR sees what the service holds. The save is not retried: a lost answer may hide a stored change.
 */
export function useSaveCalendarException() {
  const { apiClient } = useSession();
  const queryClient = useQueryClient();
  return useMutation<WorkCalendarDate, Error, CalendarExceptionSave>({
    mutationFn: (save) => saveCalendarException(apiClient, save),
    onSettled: () => queryClient.invalidateQueries({ queryKey: calendarExceptionQueryKeys.all }),
  });
}
