import { INTERNAL_HTTP_CLIENT, ServiceName, type IInternalHttpClient } from '@dexa/common';
import {
  API_PREFIX,
  ErrorCode,
  workScheduleOverviewSchema,
  type WorkScheduleOverview,
} from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { IWorkScheduleClient } from './work-schedule-client.interface.js';

// The gateway forwards the caller's token, so a 401 from attendance-service means that token was refused. The gateway's
// own status check already ran before this call.
const USER_TOKEN_REFUSAL_CODES = [ErrorCode.UNAUTHORIZED, ErrorCode.ACCOUNT_DISABLED];
const WORK_SCHEDULES_PATH = `/${API_PREFIX}/work-schedules`;

@Injectable()
export class WorkScheduleClient implements IWorkScheduleClient {
  constructor(@Inject(INTERNAL_HTTP_CLIENT) private readonly httpClient: IInternalHttpClient) {}

  // HR only: the gateway guard and attendance-service both check the role. A read, so it is not retried.
  getScheduleOverview(accessToken: string): Promise<WorkScheduleOverview> {
    return this.httpClient.get({
      target: ServiceName.ATTENDANCE_SERVICE,
      path: WORK_SCHEDULES_PATH,
      forwardedUserToken: accessToken,
      refusalCodes: USER_TOKEN_REFUSAL_CODES,
      responseSchema: workScheduleOverviewSchema,
    });
  }
}
