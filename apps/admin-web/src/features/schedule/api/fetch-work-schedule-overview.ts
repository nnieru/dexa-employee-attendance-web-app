import { workScheduleOverviewSchema, type WorkScheduleOverview } from '@dexa/contracts';
import { parseResponse } from '@dexa/api-client';
import type { ApiClient } from '@dexa/session';

const WORK_SCHEDULES_PATH = '/work-schedules';

/** The version in effect and the upcoming version (PRD SCH-3). HR only. */
export async function fetchWorkScheduleOverview(
  apiClient: ApiClient,
): Promise<WorkScheduleOverview> {
  const response = await apiClient.get<unknown>(WORK_SCHEDULES_PATH);
  return parseResponse(workScheduleOverviewSchema, response.data);
}
