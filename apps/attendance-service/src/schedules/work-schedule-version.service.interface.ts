import type { WorkScheduleVersion, WorkScheduleVersionRequest } from '@dexa/contracts';

export const WORK_SCHEDULE_VERSION_SERVICE = Symbol('IWorkScheduleVersionService');

/** HR's changes to the company schedule (PRD SCH-4). Each change takes effect tomorrow or later. */
export interface IWorkScheduleVersionService {
  /** Creates the next version, and ends the version in effect on the day it starts. */
  createVersion(request: WorkScheduleVersionRequest): Promise<WorkScheduleVersion>;
  /** Edits the upcoming version. A version already in effect or in the past is refused. */
  updateVersion(
    versionId: string,
    request: WorkScheduleVersionRequest,
  ): Promise<WorkScheduleVersion>;
}
