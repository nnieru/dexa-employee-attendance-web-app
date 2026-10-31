import type { WorkScheduleOverview } from '@dexa/contracts';

export const WORK_SCHEDULE_SERVICE = Symbol('IWorkScheduleService');

/** HR's view of the company schedule (PRD SCH-3). Grace values are part of it, so only HR may call it. */
export interface IWorkScheduleService {
  /** The version in effect today and the next version that has not taken effect, judged on the business date. */
  getScheduleOverview(): Promise<WorkScheduleOverview>;
}
