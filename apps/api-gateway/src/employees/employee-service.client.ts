import {
  INTERNAL_HTTP_CLIENT,
  ServiceName,
  type IInternalHttpClient,
  type InternalBinaryResponse,
  type AuthenticatedUser,
} from '@dexa/common';
import {
  API_PREFIX,
  employeeDetailSchema,
  employeeListPageSchema,
  ErrorCode,
  masterOptionListSchema,
  ownProfileSchema,
  PHOTO_FIELD_NAME,
  type CreateEmployeeRequest,
  type EmployeeDetail,
  type EmployeeListPage,
  type EmployeeListQuery,
  type MasterOption,
  type OwnProfile,
  type UpdateEmployeeRequest,
  type UpdateOwnProfileRequest,
} from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { IEmployeeServiceClient } from './employee-service-client.interface.js';

// A photo is at most 5 MiB, so its transfer needs more than the default timeout of the internal calls.
const PHOTO_TIMEOUT_MILLISECONDS = 10_000;
const PHOTO_PATH = `/${API_PREFIX}/employees/me/photo`;
const EMPLOYEES_PATH = `/${API_PREFIX}/employees`;
// A create that stopped partway answers 503 with this code, its operation ID, and the saved phase. The gateway
// passes that answer on, so HR can retry the same operation (DATABASE §4.3).
const PASS_THROUGH_CREATE_CODES = [ErrorCode.EMPLOYEE_PROVISIONING_INCOMPLETE];
// An update that stopped after its first save answers 503 with this code and the steps that saved (DATABASE §4.3).
const PASS_THROUGH_UPDATE_CODES = [ErrorCode.EMPLOYEE_UPDATE_INCOMPLETE];

@Injectable()
export class EmployeeServiceClient implements IEmployeeServiceClient {
  constructor(@Inject(INTERNAL_HTTP_CLIENT) private readonly httpClient: IInternalHttpClient) {}

  listPositions(user: AuthenticatedUser): Promise<MasterOption[]> {
    return this.httpClient.get({
      target: ServiceName.EMPLOYEE_SERVICE,
      path: `/${API_PREFIX}/positions`,
      onBehalfOf: user,
      responseSchema: masterOptionListSchema,
    });
  }

  listEmployeeStatuses(user: AuthenticatedUser): Promise<MasterOption[]> {
    return this.httpClient.get({
      target: ServiceName.EMPLOYEE_SERVICE,
      path: `/${API_PREFIX}/employee-statuses`,
      onBehalfOf: user,
      responseSchema: masterOptionListSchema,
    });
  }

  // The employee-service derives the identity from the forwarded user, which the gateway's token names (D-51).
  getOwnProfile(user: AuthenticatedUser): Promise<OwnProfile> {
    return this.httpClient.get({
      target: ServiceName.EMPLOYEE_SERVICE,
      path: `/${API_PREFIX}/employees/me`,
      onBehalfOf: user,
      responseSchema: ownProfileSchema,
    });
  }

  // The create is not retried: a lost answer is replayed by HR with the same operation ID, never by the gateway.
  createEmployee(user: AuthenticatedUser, request: CreateEmployeeRequest): Promise<EmployeeDetail> {
    return this.httpClient.post({
      target: ServiceName.EMPLOYEE_SERVICE,
      path: EMPLOYEES_PATH,
      body: request,
      onBehalfOf: user,
      passThroughErrorCodes: PASS_THROUGH_CREATE_CODES,
      responseSchema: employeeDetailSchema,
    });
  }

  // The update is not retried: a lost answer may hide a change that already saved, so HR decides whether to save again.
  updateEmployee(
    user: AuthenticatedUser,
    accountId: string,
    request: UpdateEmployeeRequest,
  ): Promise<EmployeeDetail> {
    return this.httpClient.patch({
      target: ServiceName.EMPLOYEE_SERVICE,
      path: `${EMPLOYEES_PATH}/${encodeURIComponent(accountId)}`,
      body: request,
      onBehalfOf: user,
      passThroughErrorCodes: PASS_THROUGH_UPDATE_CODES,
      responseSchema: employeeDetailSchema,
    });
  }

  // The employee-service writes only the caller's own phone, so the call acts on behalf of the caller.
  updateOwnProfile(user: AuthenticatedUser, request: UpdateOwnProfileRequest): Promise<OwnProfile> {
    return this.httpClient.patch({
      target: ServiceName.EMPLOYEE_SERVICE,
      path: `/${API_PREFIX}/employees/me`,
      body: request,
      onBehalfOf: user,
      responseSchema: ownProfileSchema,
    });
  }

  // The bytes were size-limited at the edge. employee-service decides what they are from their content, so the
  // part carries no client-declared type. A PUT is never retried, so a lost answer is not replayed.
  updateOwnPhoto(user: AuthenticatedUser, photo: Buffer): Promise<OwnProfile> {
    return this.httpClient.put({
      target: ServiceName.EMPLOYEE_SERVICE,
      path: PHOTO_PATH,
      file: { fieldName: PHOTO_FIELD_NAME, fileName: 'photo', content: photo },
      onBehalfOf: user,
      timeoutMilliseconds: PHOTO_TIMEOUT_MILLISECONDS,
      responseSchema: ownProfileSchema,
    });
  }

  getOwnPhoto(user: AuthenticatedUser): Promise<InternalBinaryResponse> {
    return this.httpClient.getBinary({
      target: ServiceName.EMPLOYEE_SERVICE,
      path: PHOTO_PATH,
      onBehalfOf: user,
      timeoutMilliseconds: PHOTO_TIMEOUT_MILLISECONDS,
    });
  }

  // The query is forwarded as the caller sent it, after the gateway's own validation, so employee-service applies the
  // same paging and search. The call acts for the caller, so employee-service still decides whether HR may list.
  listEmployees(user: AuthenticatedUser, query: EmployeeListQuery): Promise<EmployeeListPage> {
    return this.httpClient.get({
      target: ServiceName.EMPLOYEE_SERVICE,
      path: EMPLOYEES_PATH,
      query: toListQueryParameters(query),
      onBehalfOf: user,
      responseSchema: employeeListPageSchema,
    });
  }

  getEmployeePhoto(user: AuthenticatedUser, accountId: string): Promise<InternalBinaryResponse> {
    return this.httpClient.getBinary({
      target: ServiceName.EMPLOYEE_SERVICE,
      path: `${EMPLOYEES_PATH}/${encodeURIComponent(accountId)}/photo`,
      onBehalfOf: user,
      timeoutMilliseconds: PHOTO_TIMEOUT_MILLISECONDS,
    });
  }
}

// An absent search term is omitted, not sent empty, so employee-service sees the same query the caller sent.
function toListQueryParameters(query: EmployeeListQuery): Record<string, string> {
  const parameters: Record<string, string> = {
    page: String(query.page),
    pageSize: String(query.pageSize),
  };
  return query.q === undefined ? parameters : { ...parameters, q: query.q };
}
