import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { WorkScheduleVersion, WorkScheduleVersionRequest } from '@dexa/contracts';
import { useSession } from '@dexa/session';
import { createWorkScheduleVersion } from '../api/create-work-schedule-version.js';
import { scheduleQueryKeys } from '../api/schedule-query-keys.js';
import { updateWorkScheduleVersion } from '../api/update-work-schedule-version.js';
import { isWorkScheduleConflictError } from '../utils/work-schedule-messages.js';

/** A save is either a new upcoming version or an edit of the one that exists. */
export type WorkScheduleSave =
  | { kind: 'create'; request: WorkScheduleVersionRequest }
  | { kind: 'update'; versionId: string; request: WorkScheduleVersionRequest };

/**
 * Sends one save. Success refreshes the overview. A conflict (409) also refreshes it, so HR reviews what another change
 * left in place before saving again. The save is not retried: a lost answer may hide a saved version.
 */
export function useSaveWorkScheduleVersion() {
  const { apiClient } = useSession();
  const queryClient = useQueryClient();
  return useMutation<WorkScheduleVersion, Error, WorkScheduleSave>({
    mutationFn: (save) =>
      save.kind === 'create'
        ? createWorkScheduleVersion(apiClient, save.request)
        : updateWorkScheduleVersion(apiClient, save.versionId, save.request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: scheduleQueryKeys.all }),
    onError: (error) => {
      if (!isWorkScheduleConflictError(error)) return;
      return queryClient.invalidateQueries({ queryKey: scheduleQueryKeys.all });
    },
  });
}
