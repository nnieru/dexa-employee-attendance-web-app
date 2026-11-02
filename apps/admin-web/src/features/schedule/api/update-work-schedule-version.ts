import {
  workScheduleVersionSchema,
  type WorkScheduleVersion,
  type WorkScheduleVersionRequest,
} from '@dexa/contracts';
import { parseResponse } from '@dexa/api-client';
import type { ApiClient } from '@dexa/session';

const WORK_SCHEDULES_PATH = '/work-schedules';

/** Replaces the upcoming version's values. A version in effect is refused by the service (409). */
export async function updateWorkScheduleVersion(
  apiClient: ApiClient,
  versionId: string,
  request: WorkScheduleVersionRequest,
): Promise<WorkScheduleVersion> {
  const response = await apiClient.put<unknown>(
    `${WORK_SCHEDULES_PATH}/${encodeURIComponent(versionId)}`,
    request,
  );
  return parseResponse(workScheduleVersionSchema, response.data);
}
