import { INTERNAL_HTTP_CLIENT, ServiceName, type IInternalHttpClient } from '@dexa/common';
import {
  API_PREFIX,
  ErrorCode,
  masterOptionListSchema,
  ownProfileSchema,
  type MasterOption,
  type OwnProfile,
  type UpdateOwnProfileRequest,
} from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { IEmployeeServiceClient } from './employee-service-client.interface.js';

// The gateway forwards the user's token on these calls, so a 401 means that token was refused. The
// employee-service does not check account status itself; the gateway's status check ran before this call.
const USER_TOKEN_REFUSAL_CODES = [ErrorCode.UNAUTHORIZED, ErrorCode.ACCOUNT_DISABLED];

@Injectable()
export class EmployeeServiceClient implements IEmployeeServiceClient {
  constructor(@Inject(INTERNAL_HTTP_CLIENT) private readonly httpClient: IInternalHttpClient) {}

  listPositions(accessToken: string): Promise<MasterOption[]> {
    return this.httpClient.get({
      target: ServiceName.EMPLOYEE_SERVICE,
      path: `/${API_PREFIX}/positions`,
      forwardedUserToken: accessToken,
      refusalCodes: USER_TOKEN_REFUSAL_CODES,
      responseSchema: masterOptionListSchema,
    });
  }

  listEmployeeStatuses(accessToken: string): Promise<MasterOption[]> {
    return this.httpClient.get({
      target: ServiceName.EMPLOYEE_SERVICE,
      path: `/${API_PREFIX}/employee-statuses`,
      forwardedUserToken: accessToken,
      refusalCodes: USER_TOKEN_REFUSAL_CODES,
      responseSchema: masterOptionListSchema,
    });
  }

  // The employee-service derives the identity from this token, so the gateway forwards it unchanged.
  getOwnProfile(accessToken: string): Promise<OwnProfile> {
    return this.httpClient.get({
      target: ServiceName.EMPLOYEE_SERVICE,
      path: `/${API_PREFIX}/employees/me`,
      forwardedUserToken: accessToken,
      refusalCodes: USER_TOKEN_REFUSAL_CODES,
      responseSchema: ownProfileSchema,
    });
  }

  // The employee-service writes only the caller's own phone, so the gateway forwards the caller's token unchanged.
  updateOwnProfile(accessToken: string, request: UpdateOwnProfileRequest): Promise<OwnProfile> {
    return this.httpClient.patch({
      target: ServiceName.EMPLOYEE_SERVICE,
      path: `/${API_PREFIX}/employees/me`,
      body: request,
      forwardedUserToken: accessToken,
      refusalCodes: USER_TOKEN_REFUSAL_CODES,
      responseSchema: ownProfileSchema,
    });
  }
}
