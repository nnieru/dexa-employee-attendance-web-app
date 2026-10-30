import type { AccountProvisioningOperation, AccountProvisioningRequest } from '@dexa/contracts';

export interface IAccountProvisioningService {
  createOperation(request: AccountProvisioningRequest): Promise<AccountProvisioningOperation>;
  activateOperation(operationId: string): Promise<AccountProvisioningOperation>;
  getOperation(operationId: string): Promise<AccountProvisioningOperation>;
}

export const ACCOUNT_PROVISIONING_SERVICE = Symbol('IAccountProvisioningService');
