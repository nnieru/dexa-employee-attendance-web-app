import {
  INTERNAL_HTTP_CLIENT,
  ServiceName,
  type IInternalHttpClient,
  type InternalBinaryResponse,
} from '@dexa/common';
import {
  API_PREFIX,
  employeeDetailSchema,
  ErrorCode,
  masterOptionListSchema,
  ownProfileSchema,
  PHOTO_FIELD_NAME,
  type CreateEmployeeRequest,
  type EmployeeDetail,
  type MasterOption,
  type OwnProfile,
  type UpdateOwnProfileRequest,
} from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { IEmployeeServiceClient } from './employee-service-client.interface.js';

// The gateway forwards the user's token on these calls, so a 401 means that token was refused. The
// employee-service does not check account status itself; the gateway's status check ran before this call.
const USER_TOKEN_REFUSAL_CODES = [ErrorCode.UNAUTHORIZED, ErrorCode.ACCOUNT_DISABLED];
// A photo is at most 5 MiB, so its transfer needs more than the default timeout of the internal calls.
const PHOTO_TIMEOUT_MILLISECONDS = 10_000;
const PHOTO_PATH = `/${API_PREFIX}/employees/me/photo`;
const EMPLOYEES_PATH = `/${API_PREFIX}/employees`;
// A create that stopped partway answers 503 with this code, its operation ID, and the saved phase. The gateway
// passes that answer on, so HR can retry the same operation (DATABASE §4.3).
const PASS_THROUGH_CREATE_CODES = [ErrorCode.EMPLOYEE_PROVISIONING_INCOMPLETE];

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

  // The create is not retried: a lost answer is replayed by HR with the same operation ID, never by the gateway.
  createEmployee(accessToken: string, request: CreateEmployeeRequest): Promise<EmployeeDetail> {
    return this.httpClient.post({
      target: ServiceName.EMPLOYEE_SERVICE,
      path: EMPLOYEES_PATH,
      body: request,
      forwardedUserToken: accessToken,
      refusalCodes: USER_TOKEN_REFUSAL_CODES,
      passThroughErrorCodes: PASS_THROUGH_CREATE_CODES,
      responseSchema: employeeDetailSchema,
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

  // The bytes were size-limited at the edge. employee-service decides what they are from their content, so the
  // part carries no client-declared type. A PUT is never retried, so a lost answer is not replayed.
  updateOwnPhoto(accessToken: string, photo: Buffer): Promise<OwnProfile> {
    return this.httpClient.put({
      target: ServiceName.EMPLOYEE_SERVICE,
      path: PHOTO_PATH,
      file: { fieldName: PHOTO_FIELD_NAME, fileName: 'photo', content: photo },
      forwardedUserToken: accessToken,
      refusalCodes: USER_TOKEN_REFUSAL_CODES,
      timeoutMilliseconds: PHOTO_TIMEOUT_MILLISECONDS,
      responseSchema: ownProfileSchema,
    });
  }

  getOwnPhoto(accessToken: string): Promise<InternalBinaryResponse> {
    return this.httpClient.getBinary({
      target: ServiceName.EMPLOYEE_SERVICE,
      path: PHOTO_PATH,
      forwardedUserToken: accessToken,
      refusalCodes: USER_TOKEN_REFUSAL_CODES,
      timeoutMilliseconds: PHOTO_TIMEOUT_MILLISECONDS,
    });
  }
}
