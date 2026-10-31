import type {
  WorkScheduleOverview,
  WorkScheduleVersion,
  WorkScheduleVersionRequest,
} from '@dexa/contracts';

/** The gateway's calls into attendance-service for the company schedule. Controllers depend on this port. */
export interface IWorkScheduleClient {
  getScheduleOverview(accessToken: string): Promise<WorkScheduleOverview>;
  createVersion(
    accessToken: string,
    request: WorkScheduleVersionRequest,
  ): Promise<WorkScheduleVersion>;
  updateVersion(
    accessToken: string,
    versionId: string,
    request: WorkScheduleVersionRequest,
  ): Promise<WorkScheduleVersion>;
}

export const WORK_SCHEDULE_CLIENT = Symbol('IWorkScheduleClient');
