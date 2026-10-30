import type { InternalBinaryResponse } from '@dexa/common';
import type {
  CreateEmployeeRequest,
  EmployeeDetail,
  EmployeeListPage,
  EmployeeListQuery,
  MasterOption,
  OwnProfile,
  UpdateEmployeeRequest,
  UpdateOwnProfileRequest,
} from '@dexa/contracts';

/** The gateway's calls into employee-service. Controllers depend on this port, not on the transport. */
export interface IEmployeeServiceClient {
  listPositions(accessToken: string): Promise<MasterOption[]>;
  listEmployeeStatuses(accessToken: string): Promise<MasterOption[]>;
  createEmployee(accessToken: string, request: CreateEmployeeRequest): Promise<EmployeeDetail>;
  updateEmployee(
    accessToken: string,
    accountId: string,
    request: UpdateEmployeeRequest,
  ): Promise<EmployeeDetail>;
  getOwnProfile(accessToken: string): Promise<OwnProfile>;
  updateOwnProfile(accessToken: string, request: UpdateOwnProfileRequest): Promise<OwnProfile>;
  updateOwnPhoto(accessToken: string, photo: Buffer): Promise<OwnProfile>;
  getOwnPhoto(accessToken: string): Promise<InternalBinaryResponse>;
  listEmployees(accessToken: string, query: EmployeeListQuery): Promise<EmployeeListPage>;
  getEmployeePhoto(accessToken: string, accountId: string): Promise<InternalBinaryResponse>;
}

export const EMPLOYEE_SERVICE_CLIENT = Symbol('IEmployeeServiceClient');
