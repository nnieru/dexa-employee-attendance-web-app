import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@dexa/session';
import { calendarExceptionQueryKeys } from '../api/calendar-exception-query-keys.js';
import { deleteCalendarException } from '../api/delete-calendar-exception.js';

/**
 * Removes the exception for one date. The list is refetched whether the removal succeeds or is refused. The removal is
 * not retried: a lost answer may hide a removed exception, and a retry would only answer 404.
 */
export function useDeleteCalendarException() {
  const { apiClient } = useSession();
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (date) => deleteCalendarException(apiClient, date),
    onSettled: () => queryClient.invalidateQueries({ queryKey: calendarExceptionQueryKeys.all }),
  });
}
