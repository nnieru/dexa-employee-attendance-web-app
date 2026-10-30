import { ConflictError, ForbiddenError, NotFoundError } from '@dexa/common';
import {
  ErrorCode,
  type AccountProvisioningOperation,
  type AccountProvisioningRequest,
} from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { PASSWORD_HASHER, type IPasswordHasher } from '../credentials/password-hasher.interface.js';
import type { IAccountProvisioningService } from './account-provisioning-service.interface.js';
import {
  ACCOUNT_PROVISIONING_REPOSITORY,
  type IAccountProvisioningRepository,
  type InsertRejection,
  type ProvisioningOperationRecord,
} from './account-provisioning.repository.interface.js';
import {
  isEligibleProvisioningActor,
  isRetryOfStoredRequest,
} from './account-provisioning.rules.js';

const ACTOR_NOT_ELIGIBLE_MESSAGE = 'Only an active HR account can provision accounts.';
const EMAIL_IN_USE_MESSAGE = 'An account already uses this company email.';
const OPERATION_ID_REUSED_MESSAGE = 'This operation ID was already used for a different request.';
const OPERATION_NOT_FOUND_MESSAGE = 'The account provisioning operation was not found.';

@Injectable()
export class AccountProvisioningService implements IAccountProvisioningService {
  constructor(
    @Inject(ACCOUNT_PROVISIONING_REPOSITORY)
    private readonly operations: IAccountProvisioningRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: IPasswordHasher,
  ) {}

  async createOperation(
    request: AccountProvisioningRequest,
  ): Promise<AccountProvisioningOperation> {
    await this.assertEligibleActor(request.actorAccountId);
    const stored = await this.operations.findOperation(request.operationId);
    if (stored !== undefined) return this.replayStoredOperation(stored, request);

    // Hashing runs outside the transaction because argon2 is slow and holds memory.
    const initialPasswordHash = await this.passwordHasher.hash(request.initialPassword);
    const result = await this.operations.createAccountWithOperation({
      operationId: request.operationId,
      actorAccountId: request.actorAccountId,
      companyEmail: request.email,
      roleCode: request.role,
      initialPasswordHash,
    });
    if (result.kind === 'INSERTED') return toOperationResponse(result.operation);
    return this.resolveRejectedInsert(result.kind, request);
  }

  async activateOperation(operationId: string): Promise<AccountProvisioningOperation> {
    await this.operations.activatePendingOperation(operationId);
    return this.getOperation(operationId);
  }

  async getOperation(operationId: string): Promise<AccountProvisioningOperation> {
    const operation = await this.operations.findOperation(operationId);
    if (operation === undefined) {
      throw new NotFoundError(ErrorCode.NOT_FOUND, OPERATION_NOT_FOUND_MESSAGE);
    }
    return toOperationResponse(operation);
  }

  private async assertEligibleActor(actorAccountId: string): Promise<void> {
    const actor = await this.operations.findActorAccount(actorAccountId);
    if (!isEligibleProvisioningActor(actor)) {
      throw new ForbiddenError(ErrorCode.FORBIDDEN, ACTOR_NOT_ELIGIBLE_MESSAGE);
    }
  }

  // A retry returns the stored operation as it is now, whatever its status, so a later activation or
  // account edit does not turn the retry into a conflict. The password is checked against the stored
  // verifier and is never reset.
  private async replayStoredOperation(
    stored: ProvisioningOperationRecord,
    request: AccountProvisioningRequest,
  ): Promise<AccountProvisioningOperation> {
    const isPasswordMatching = await this.passwordHasher.verify(
      stored.initialPasswordHash,
      request.initialPassword,
    );
    if (!isRetryOfStoredRequest(stored, request, isPasswordMatching)) {
      throw new ConflictError(ErrorCode.CONFLICT, OPERATION_ID_REUSED_MESSAGE);
    }
    return toOperationResponse(stored);
  }

  // The unique check waits for a concurrent transaction to finish, so a request that won the race is
  // committed and visible to this read. A same-ID winner means this request is a retry of it.
  private async resolveRejectedInsert(
    rejection: InsertRejection,
    request: AccountProvisioningRequest,
  ): Promise<AccountProvisioningOperation> {
    const committed = await this.operations.findOperation(request.operationId);
    if (committed !== undefined) return this.replayStoredOperation(committed, request);
    const message =
      rejection === 'EMAIL_TAKEN' ? EMAIL_IN_USE_MESSAGE : OPERATION_ID_REUSED_MESSAGE;
    throw new ConflictError(ErrorCode.CONFLICT, message);
  }
}

// The response carries only the identifiers and status. The stored verifier is never returned.
function toOperationResponse(operation: ProvisioningOperationRecord): AccountProvisioningOperation {
  return {
    operationId: operation.operationId,
    accountId: operation.accountId,
    status: operation.status,
  };
}
