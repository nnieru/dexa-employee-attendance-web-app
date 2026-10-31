import {
  INTERNAL_HTTP_CLIENT,
  ServiceName,
  type AuthenticatedUser,
  type IInternalHttpClient,
} from '@dexa/common';
import {
  API_PREFIX,
  workScheduleOverviewSchema,
  workScheduleVersionSchema,
  type WorkScheduleOverview,
  type WorkScheduleVersion,
  type WorkScheduleVersionRequest,
} from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { IWorkScheduleClient } from './work-schedule-client.interface.js';

const WORK_SCHEDULES_PATH = `/${API_PREFIX}/work-schedules`;

@Injectable()
export class WorkScheduleClient implements IWorkScheduleClient {
  constructor(@Inject(INTERNAL_HTTP_CLIENT) private readonly httpClient: IInternalHttpClient) {}

  // HR only: the gateway guard and attendance-service both check the role. A read, so it is not retried.
  getScheduleOverview(user: AuthenticatedUser): Promise<WorkScheduleOverview> {
    return this.httpClient.get({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: WORK_SCHEDULES_PATH,
      onBehalfOf: user,
      responseSchema: workScheduleOverviewSchema,
    });
  }

  // A create is not retried: a lost answer may hide a version that was saved, and a retry would only answer 409.
  createVersion(
    user: AuthenticatedUser,
    request: WorkScheduleVersionRequest,
  ): Promise<WorkScheduleVersion> {
    return this.httpClient.post({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: WORK_SCHEDULES_PATH,
      body: request,
      onBehalfOf: user,
      responseSchema: workScheduleVersionSchema,
    });
  }

  // An edit is not retried either: a PUT that was saved answers 409 on a second send, so HR decides whether to save again.
  updateVersion(
    user: AuthenticatedUser,
    versionId: string,
    request: WorkScheduleVersionRequest,
  ): Promise<WorkScheduleVersion> {
    return this.httpClient.putJson({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: `${WORK_SCHEDULES_PATH}/${encodeURIComponent(versionId)}`,
      body: request,
      onBehalfOf: user,
      responseSchema: workScheduleVersionSchema,
    });
  }
}
