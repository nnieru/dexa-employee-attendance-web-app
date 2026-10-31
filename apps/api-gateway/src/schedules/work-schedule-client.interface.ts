import type { AuthenticatedUser } from '@dexa/common';
import type {
  WorkScheduleOverview,
  WorkScheduleVersion,
  WorkScheduleVersionRequest,
} from '@dexa/contracts';

/** The gateway's calls into attendance-service for the company schedule. Controllers depend on this port. */
export interface IWorkScheduleClient {
  getScheduleOverview(user: AuthenticatedUser): Promise<WorkScheduleOverview>;
  createVersion(
    user: AuthenticatedUser,
    request: WorkScheduleVersionRequest,
  ): Promise<WorkScheduleVersion>;
  updateVersion(
    user: AuthenticatedUser,
    versionId: string,
    request: WorkScheduleVersionRequest,
  ): Promise<WorkScheduleVersion>;
}

export const WORK_SCHEDULE_CLIENT = Symbol('IWorkScheduleClient');
