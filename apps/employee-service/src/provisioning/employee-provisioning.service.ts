import { DependencyUnavailableError } from '@dexa/common';
import {
  EmployeeProvisioningSavedPhase,
  type CreateEmployeeRequest,
  type EmployeeDetail,
  type EmployeeProvisioningIncompleteDetails,
} from '@dexa/contracts';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AUTH_ACCOUNT_CLIENT,
  type IAuthAccountClient,
} from '../auth-accounts/auth-account-client.interface.js';
import { calculateProfileStatus } from '../profile/profile-completion.rules.js';
import {
  AUTH_PROVISIONING_CLIENT,
  type IAuthProvisioningClient,
} from './auth-provisioning-client.interface.js';
import { EmployeeProvisioningState } from './employee-provisioning-state.js';
import {
  dependencyUnavailableError,
  masterNotAssignableError,
  operationReusedError,
  profileExistsError,
  provisioningIncompleteError,
} from './employee-provisioning.errors.js';
import {
  findUnassignableMasterField,
  isActivationConfirmed,
  isSameProvisioningRequest,
  needsActivation,
  needsProfileSave,
  type StoredProvisioningRequest,
} from './employee-provisioning.rules.js';
import {
  EMPLOYEE_PROVISIONING_REPOSITORY,
  type EmployeeProvisioningOperation,
  type IEmployeeProvisioningRepository,
  type NewEmployeeProfile,
  type ProfileSaveOutcome,
} from './employee-provisioning.repository.interface.js';
import type { IEmployeeProvisioningService } from './employee-provisioning.service.interface.js';
import { calculateProvisioningFingerprint } from './provisioning-fingerprint.rules.js';
import { toEmployeeDetail } from './employee-detail.rules.js';

/**
 * Creates an employee in three steps that survive a failure between them (DATABASE §4.3): Auth creates the
 * PENDING account, the profile is saved with the account bound, and Auth activates the account. The operation's
 * stored phase says where a retry resumes. No transaction spans the calls, so each step is idempotent on its own.
 */
@Injectable()
export class EmployeeProvisioningService implements IEmployeeProvisioningService {
  private readonly logger = new Logger(EmployeeProvisioningService.name);

  constructor(
    @Inject(EMPLOYEE_PROVISIONING_REPOSITORY)
    private readonly repository: IEmployeeProvisioningRepository,
    @Inject(AUTH_PROVISIONING_CLIENT) private readonly authProvisioning: IAuthProvisioningClient,
    @Inject(AUTH_ACCOUNT_CLIENT) private readonly authAccounts: IAuthAccountClient,
  ) {}

  async createEmployee(
    actorAccountId: string,
    request: CreateEmployeeRequest,
  ): Promise<EmployeeDetail> {
    const fingerprint = calculateProvisioningFingerprint(toFingerprintFields(request));
    const stored = await this.repository.findOperation(request.operationId);
    if (stored !== undefined) assertSameRequest(stored, actorAccountId, fingerprint);
    // A saved profile is never checked again, so a retry still reaches activation when HR has since deactivated a
    // master option that the profile uses.
    if (stored === undefined || needsProfileSave(stored.state)) {
      await this.assertMastersAssignable(request);
    }
    const operation =
      stored ?? (await this.reserveOperation(actorAccountId, request.operationId, fingerprint));

    const accountId = await this.createAuthAccount(actorAccountId, request, operation);
    const state = await this.saveProfileIfNeeded(request, accountId, operation.state);
    await this.activateIfNeeded(request.operationId, accountId, state);
    return this.readEmployeeDetail(accountId);
  }

  private async assertMastersAssignable(request: CreateEmployeeRequest): Promise<void> {
    const position = await this.repository.findPositionOption(request.positionId);
    const employeeStatus = await this.repository.findEmployeeStatusOption(request.employeeStatusId);
    const field = findUnassignableMasterField(position, employeeStatus);
    if (field !== undefined) throw masterNotAssignableError(field);
  }

  private async reserveOperation(
    actorAccountId: string,
    operationId: string,
    fingerprint: string,
  ): Promise<EmployeeProvisioningOperation> {
    const operation = await this.repository.reserveOperation({
      operationId,
      actorAccountId,
      requestFingerprintSha256: fingerprint,
    });
    assertSameRequest(operation, actorAccountId, fingerprint);
    return operation;
  }

  // Every create calls Auth with the original password, so Auth checks the immutable request on each retry.
  private async createAuthAccount(
    actorAccountId: string,
    request: CreateEmployeeRequest,
    operation: EmployeeProvisioningOperation,
  ): Promise<string> {
    const answer = await this.callAuth(partialDetailsOf(operation), () =>
      this.authProvisioning.createOperation({
        operationId: request.operationId,
        actorAccountId,
        email: request.email,
        role: request.role,
        initialPassword: request.initialPassword,
      }),
    );
    if (operation.accountId !== undefined && operation.accountId !== answer.accountId) {
      throw new Error('Auth answered with another account for a stored operation.');
    }
    return answer.accountId;
  }

  // A matching retry skips the save when the profile is already saved, so HR's later edits are never overwritten.
  private async saveProfileIfNeeded(
    request: CreateEmployeeRequest,
    accountId: string,
    state: EmployeeProvisioningState,
  ): Promise<EmployeeProvisioningState> {
    if (!needsProfileSave(state)) return state;
    const outcome = await this.repository.saveProfileForReservedOperation(
      request.operationId,
      toNewProfile(request, accountId),
    );
    return resolveSaveOutcome(outcome);
  }

  private async activateIfNeeded(
    operationId: string,
    accountId: string,
    state: EmployeeProvisioningState,
  ): Promise<void> {
    if (!needsActivation(state)) return;
    await this.activateAuthAccount(operationId, accountId);
    await this.repository.markOperationActive(operationId);
  }

  // Activation is idempotent, so a lost answer is reconciled by the next retry. An answer other than ACTIVE is not
  // trusted on its own: Auth's operation lookup must confirm it before the operation is marked ACTIVE.
  private async activateAuthAccount(operationId: string, accountId: string): Promise<void> {
    const partialDetails = savedAfterProfile(operationId, accountId);
    const answer = await this.callAuth(partialDetails, () =>
      this.authProvisioning.activateOperation(operationId),
    );
    if (isActivationConfirmed(answer, accountId)) return;
    const current = await this.callAuth(partialDetails, () =>
      this.authProvisioning.getOperation(operationId),
    );
    if (!isActivationConfirmed(current, accountId))
      throw provisioningIncompleteError(partialDetails);
  }

  private async readEmployeeDetail(accountId: string): Promise<EmployeeDetail> {
    const record = await this.repository.findEmployeeDetail(accountId);
    if (record === undefined) throw new Error('The saved employee profile is missing.');
    const account = await this.authAccounts.findAccountById(accountId);
    if (account === undefined) throw dependencyUnavailableError();
    return toEmployeeDetail(record, account);
  }

  // An Auth outage is reported with the stored phase when that phase is partial. For an operation that is already
  // ACTIVE, nothing is partial, so the outage keeps the generic dependency answer.
  private async callAuth<TAnswer>(
    partialDetails: EmployeeProvisioningIncompleteDetails | undefined,
    call: () => Promise<TAnswer>,
  ): Promise<TAnswer> {
    try {
      return await call();
    } catch (error: unknown) {
      if (!(error instanceof DependencyUnavailableError) || partialDetails === undefined)
        throw error;
      this.logger.warn(
        `Employee provisioning operation ${partialDetails.operationId} stopped at ${partialDetails.savedPhase}: Auth did not answer.`,
      );
      throw provisioningIncompleteError(partialDetails);
    }
  }
}

function assertSameRequest(
  stored: StoredProvisioningRequest,
  actorAccountId: string,
  fingerprint: string,
): void {
  if (!isSameProvisioningRequest(stored, actorAccountId, fingerprint)) {
    throw operationReusedError();
  }
}

// The fields that identify the request. The password is not one of them, so it never reaches the fingerprint.
function toFingerprintFields(request: CreateEmployeeRequest): {
  readonly email: string;
  readonly name: string;
  readonly positionId: string;
  readonly employeeStatusId: string;
  readonly phoneNumber: string | null;
} {
  return {
    email: request.email,
    name: request.name,
    positionId: request.positionId,
    employeeStatusId: request.employeeStatusId,
    phoneNumber: request.phoneNumber,
  };
}

// A new profile has no photo yet, so its completion follows the rule in DATABASE §4.1.
function toNewProfile(request: CreateEmployeeRequest, accountId: string): NewEmployeeProfile {
  return {
    accountId,
    name: request.name,
    positionId: request.positionId,
    employeeStatusId: request.employeeStatusId,
    phoneNumber: request.phoneNumber,
    profileStatus: calculateProfileStatus({
      name: request.name,
      positionId: request.positionId,
      phoneNumber: request.phoneNumber,
      photoKey: null,
    }),
  };
}

function resolveSaveOutcome(outcome: ProfileSaveOutcome): EmployeeProvisioningState {
  switch (outcome.kind) {
    case 'SAVED':
      return EmployeeProvisioningState.PROFILE_SAVED;
    case 'ALREADY_SAVED':
      return outcome.state;
    case 'PROFILE_EXISTS':
      throw profileExistsError();
    case 'MASTER_NOT_ASSIGNABLE':
      throw masterNotAssignableError(outcome.field);
  }
}

// The details of a stop before the account is active. Undefined once the operation is ACTIVE.
function partialDetailsOf(
  operation: EmployeeProvisioningOperation,
): EmployeeProvisioningIncompleteDetails | undefined {
  if (operation.state === EmployeeProvisioningState.ACTIVE) return undefined;
  const accountIdDetails =
    operation.accountId === undefined ? {} : { accountId: operation.accountId };
  return {
    operationId: operation.operationId,
    savedPhase: operation.state,
    ...accountIdDetails,
  };
}

function savedAfterProfile(
  operationId: string,
  accountId: string,
): EmployeeProvisioningIncompleteDetails {
  return {
    operationId,
    savedPhase: EmployeeProvisioningSavedPhase.PROFILE_SAVED,
    accountId,
  };
}
