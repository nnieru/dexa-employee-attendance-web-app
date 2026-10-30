import type { MasterOption, OwnProfile, UpdateOwnProfileRequest } from '@dexa/contracts';

/** The gateway's calls into employee-service. Controllers depend on this port, not on the transport. */
export interface IEmployeeServiceClient {
  listPositions(accessToken: string): Promise<MasterOption[]>;
  listEmployeeStatuses(accessToken: string): Promise<MasterOption[]>;
  getOwnProfile(accessToken: string): Promise<OwnProfile>;
  updateOwnProfile(accessToken: string, request: UpdateOwnProfileRequest): Promise<OwnProfile>;
}

export const EMPLOYEE_SERVICE_CLIENT = Symbol('IEmployeeServiceClient');
