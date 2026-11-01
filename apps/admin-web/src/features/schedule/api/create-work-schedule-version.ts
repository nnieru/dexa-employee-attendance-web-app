import {
  workScheduleVersionSchema,
  type WorkScheduleVersion,
  type WorkScheduleVersionRequest,
} from '@dexa/contracts';
import { parseResponse } from '@dexa/api-client';
import type { ApiClient } from '@dexa/session';

const WORK_SCHEDULES_PATH = '/work-schedules';

/** Creates a new upcoming version (PRD SCH-4). The response is the stored version. */
export async function createWorkScheduleVersion(
  apiClient: ApiClient,
  request: WorkScheduleVersionRequest,
): Promise<WorkScheduleVersion> {
  const response = await apiClient.post<unknown>(WORK_SCHEDULES_PATH, request);
  return parseResponse(workScheduleVersionSchema, response.data);
}
