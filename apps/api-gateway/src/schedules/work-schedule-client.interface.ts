import type { WorkScheduleOverview } from '@dexa/contracts';

/** The gateway's calls into attendance-service for the company schedule. Controllers depend on this port. */
export interface IWorkScheduleClient {
  getScheduleOverview(accessToken: string): Promise<WorkScheduleOverview>;
}

export const WORK_SCHEDULE_CLIENT = Symbol('IWorkScheduleClient');
