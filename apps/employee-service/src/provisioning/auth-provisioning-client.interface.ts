import type { AccountProvisioningOperation, AccountProvisioningRequest } from '@dexa/contracts';

export const AUTH_PROVISIONING_CLIENT = Symbol('IAuthProvisioningClient');

/**
 * Calls auth-service's provisioning routes with this service's own token. Every answer has the same
 * operation shape. A 409 reaches the caller as a conflict, and an outage as a dependency failure.
 */
export interface IAuthProvisioningClient {
  createOperation(request: AccountProvisioningRequest): Promise<AccountProvisioningOperation>;
  /** Idempotent: an operation that is already ACTIVE answers ACTIVE again. */
  activateOperation(operationId: string): Promise<AccountProvisioningOperation>;
  getOperation(operationId: string): Promise<AccountProvisioningOperation>;
}
