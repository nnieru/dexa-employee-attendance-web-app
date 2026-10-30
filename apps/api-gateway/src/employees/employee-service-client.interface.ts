import type { MasterOption } from '@dexa/contracts';

/** The gateway's calls into employee-service. Controllers depend on this port, not on the transport. */
export interface IEmployeeServiceClient {
  listPositions(accessToken: string): Promise<MasterOption[]>;
  listEmployeeStatuses(accessToken: string): Promise<MasterOption[]>;
}

export const EMPLOYEE_SERVICE_CLIENT = Symbol('IEmployeeServiceClient');
