import type { AuthenticatedUser, InternalBinaryResponse } from '@dexa/common';
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
  listPositions(user: AuthenticatedUser): Promise<MasterOption[]>;
  listEmployeeStatuses(user: AuthenticatedUser): Promise<MasterOption[]>;
  createEmployee(user: AuthenticatedUser, request: CreateEmployeeRequest): Promise<EmployeeDetail>;
  updateEmployee(
    user: AuthenticatedUser,
    accountId: string,
    request: UpdateEmployeeRequest,
  ): Promise<EmployeeDetail>;
  getOwnProfile(user: AuthenticatedUser): Promise<OwnProfile>;
  updateOwnProfile(user: AuthenticatedUser, request: UpdateOwnProfileRequest): Promise<OwnProfile>;
  updateOwnPhoto(user: AuthenticatedUser, photo: Buffer): Promise<OwnProfile>;
  getOwnPhoto(user: AuthenticatedUser): Promise<InternalBinaryResponse>;
  listEmployees(user: AuthenticatedUser, query: EmployeeListQuery): Promise<EmployeeListPage>;
  getEmployeePhoto(user: AuthenticatedUser, accountId: string): Promise<InternalBinaryResponse>;
}

export const EMPLOYEE_SERVICE_CLIENT = Symbol('IEmployeeServiceClient');
