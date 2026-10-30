import { INTERNAL_HTTP_CLIENT, ServiceName, type IInternalHttpClient } from '@dexa/common';
import {
  API_PREFIX,
  accountProvisioningOperationSchema,
  type AccountProvisioningOperation,
  type AccountProvisioningRequest,
} from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { IAuthProvisioningClient } from './auth-provisioning-client.interface.js';

const OPERATIONS_PATH = `/${API_PREFIX}/internal/account-provisioning-operations`;

/**
 * Calls auth-service's provisioning routes with this service's token. The end user's token is never forwarded,
 * because auth-service authorizes only the calling service for these routes. No call is retried here: a create
 * or an activation may already have changed state when its answer was lost, so the caller replays the operation.
 */
@Injectable()
export class AuthProvisioningClient implements IAuthProvisioningClient {
  constructor(@Inject(INTERNAL_HTTP_CLIENT) private readonly httpClient: IInternalHttpClient) {}

  createOperation(request: AccountProvisioningRequest): Promise<AccountProvisioningOperation> {
    return this.httpClient.post({
      target: ServiceName.AUTH_SERVICE,
      path: OPERATIONS_PATH,
      body: request,
      responseSchema: accountProvisioningOperationSchema,
    });
  }

  activateOperation(operationId: string): Promise<AccountProvisioningOperation> {
    return this.httpClient.post({
      target: ServiceName.AUTH_SERVICE,
      path: operationPath(operationId, 'activation'),
      body: undefined,
      responseSchema: accountProvisioningOperationSchema,
    });
  }

  getOperation(operationId: string): Promise<AccountProvisioningOperation> {
    return this.httpClient.get({
      target: ServiceName.AUTH_SERVICE,
      path: operationPath(operationId),
      responseSchema: accountProvisioningOperationSchema,
    });
  }
}

function operationPath(operationId: string, action?: 'activation'): string {
  const path = `${OPERATIONS_PATH}/${encodeURIComponent(operationId)}`;
  return action === undefined ? path : `${path}/${action}`;
}
