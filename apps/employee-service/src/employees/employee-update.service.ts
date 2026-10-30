import { DependencyUnavailableError, DomainError } from '@dexa/common';
import type { EmployeeDetail, ProfileField } from '@dexa/contracts';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AUTH_ACCOUNT_CLIENT,
  type IAuthAccountClient,
} from '../auth-accounts/auth-account-client.interface.js';
import {
  AUTH_ACCOUNT_ADMINISTRATION_CLIENT,
  type IAuthAccountAdministrationClient,
} from '../auth-accounts/auth-account-administration-client.interface.js';
import { assertMastersAssignable } from '../masters/assert-masters-assignable.js';
import { masterNotAssignableError } from '../masters/master-assignment.errors.js';
import {
  MASTER_ASSIGNMENT_READER,
  type IMasterAssignmentReader,
} from '../masters/master-assignment.reader.interface.js';
import {
  EMPLOYEE_PROFILE_WRITER,
  type IEmployeeProfileTransaction,
  type IEmployeeProfileWriter,
} from '../profile/employee-profile.writer.interface.js';
import { profileNotFoundError } from '../profile/profile.errors.js';
import {
  AccountActivityChange,
  isSelfDeactivation,
  resolveRequiredAccountActivity,
} from './account-activity.rules.js';
import {
  EMPLOYEE_DETAIL_READER,
  type EmployeeDetailRecord,
  type IEmployeeDetailReader,
} from './employee-detail.reader.interface.js';
import { toEmployeeDetail } from './employee-detail.rules.js';
import {
  employeeUpdateIncompleteError,
  NOTHING_SAVED,
  selfDeactivationError,
  type EmployeeUpdateProgress,
} from './employee-update.errors.js';
import {
  planEmployeeUpdate,
  requestsProfileChange,
  toChangedMasterReferences,
  type EmployeeProfileRequest,
} from './employee-update.rules.js';
import type {
  EmployeeUpdateCommand,
  EmployeeUpdateResult,
  IEmployeeUpdateService,
} from './employee-update.service.interface.js';

// The step names are what a log line says about a stop. They carry no personal data.
type UpdateStep = 'account status' | 'profile' | 'password reset' | 'response';

// The outcome of the profile transaction. It is returned rather than thrown inside the transaction, so the rollback is
// the transaction's and each outcome maps to one answer.
type ProfileUpdateOutcome =
  | { readonly kind: 'NOT_FOUND' }
  | { readonly kind: 'UNCHANGED' }
  | { readonly kind: 'SAVED'; readonly changedFields: ReadonlyArray<ProfileField> };

/**
 * Applies HR's update in the order that keeps an account consistent without a distributed transaction (DATABASE §4.3).
 *
 * Every requested status brings the Auth account in line with it, even when the stored status already matches (D-13).
 * INACTIVE deactivates: Auth is set inactive before the profile is written, so an employee HR has deactivated is never
 * usable in Auth. Any other status reactivates: the profile is written first, so Auth is never reactivated for a change
 * that did not save. Because Auth's route is idempotent, a retry that repeats the status repairs an earlier failed Auth
 * call. A request that names no status makes no Auth status call. A password reset runs last. A failure after the first
 * save stops the update with the saved steps reported; nothing is rolled back.
 */
@Injectable()
export class EmployeeUpdateService implements IEmployeeUpdateService {
  private readonly logger = new Logger(EmployeeUpdateService.name);

  constructor(
    @Inject(EMPLOYEE_DETAIL_READER) private readonly details: IEmployeeDetailReader,
    @Inject(MASTER_ASSIGNMENT_READER) private readonly masters: IMasterAssignmentReader,
    @Inject(EMPLOYEE_PROFILE_WRITER) private readonly profiles: IEmployeeProfileWriter,
    @Inject(AUTH_ACCOUNT_CLIENT) private readonly authAccounts: IAuthAccountClient,
    @Inject(AUTH_ACCOUNT_ADMINISTRATION_CLIENT)
    private readonly authAdministration: IAuthAccountAdministrationClient,
  ) {}

  async updateEmployee(command: EmployeeUpdateCommand): Promise<EmployeeUpdateResult> {
    const activityChange = await this.decideActivityChange(command);
    let progress: EmployeeUpdateProgress = NOTHING_SAVED;

    if (activityChange === AccountActivityChange.DEACTIVATE) {
      await this.setAccountActive(command, false, progress);
      progress = { ...progress, accountStatusSaved: true };
    }
    const changedFields = await this.saveProfile(command, activityChange, progress);
    progress = { ...progress, profileSaved: true };

    if (activityChange === AccountActivityChange.REACTIVATE) {
      await this.setAccountActive(command, true, progress);
      progress = { ...progress, accountStatusSaved: true };
    }
    if (command.request.newPassword !== undefined) {
      await this.resetPassword(command, command.request.newPassword, progress);
      progress = { ...progress, passwordReset: true };
    }
    const employee = await this.readSavedEmployee(command.accountId, progress);
    return { employee, changedFields };
  }

  // Returns the Auth change that the requested status requires, or undefined when the request names no status.
  // Everything that can refuse the update is checked here, before any write, so a refusal leaves nothing saved.
  private async decideActivityChange(
    command: EmployeeUpdateCommand,
  ): Promise<AccountActivityChange | undefined> {
    const stored = await this.details.findEmployeeDetail(command.accountId);
    if (stored === undefined) throw profileNotFoundError();
    await assertMastersAssignable(this.masters, toChangedMasterReferences(stored, command.request));
    const requestedStatusCode = await this.readRequestedStatusCode(stored, command.request);
    if (requestedStatusCode === undefined) return undefined;
    const activityChange = resolveRequiredAccountActivity(requestedStatusCode);
    if (
      isSelfDeactivation({
        actorAccountId: command.actorAccountId,
        targetAccountId: command.accountId,
        activityChange,
      })
    ) {
      throw selfDeactivationError();
    }
    return activityChange;
  }

  // A status that keeps its stored ID keeps its stored code, and a code never changes for an ID. A new status was checked
  // by assertMastersAssignable, so an option that is missing when it is read again is refused the same way.
  private async readRequestedStatusCode(
    stored: EmployeeDetailRecord,
    request: EmployeeProfileRequest,
  ): Promise<string | undefined> {
    if (request.employeeStatusId === undefined) return undefined;
    if (request.employeeStatusId === stored.employeeStatus.id) return stored.employeeStatus.code;
    const option = await this.masters.findEmployeeStatusOption(request.employeeStatusId);
    if (option === undefined) throw masterNotAssignableError('employeeStatusId');
    return option.code;
  }

  private async setAccountActive(
    command: EmployeeUpdateCommand,
    isActive: boolean,
    progress: EmployeeUpdateProgress,
  ): Promise<void> {
    const answer = await this.callAuth(command.accountId, 'account status', progress, () =>
      this.authAdministration.setActiveStatus(command.accountId, {
        actorAccountId: command.actorAccountId,
        isActive,
      }),
    );
    // Auth answers with the stored flag. An answer that differs from the request does not confirm this change.
    if (answer.isActive !== isActive) {
      throw this.stopped(command.accountId, 'account status', progress);
    }
  }

  private async resetPassword(
    command: EmployeeUpdateCommand,
    newPassword: string,
    progress: EmployeeUpdateProgress,
  ): Promise<void> {
    await this.callAuth(command.accountId, 'password reset', progress, () =>
      this.authAdministration.resetPassword(command.accountId, {
        actorAccountId: command.actorAccountId,
        newPassword,
      }),
    );
  }

  // Returns the reported fields of the committed change. A deactivated account is already inactive in Auth, so a
  // failed profile save after that is reported as a partial update rather than as a plain error.
  private async saveProfile(
    command: EmployeeUpdateCommand,
    activityChange: AccountActivityChange | undefined,
    progress: EmployeeUpdateProgress,
  ): Promise<ReadonlyArray<ProfileField>> {
    if (!requestsProfileChange(command.request)) return [];
    try {
      const outcome = await this.profiles.runInTransaction((transaction) =>
        applyProfileUpdate(transaction, command),
      );
      return resolveProfileOutcome(outcome);
    } catch (error: unknown) {
      if (activityChange !== AccountActivityChange.DEACTIVATE) throw error;
      throw this.stopped(command.accountId, 'profile', progress);
    }
  }

  // An Auth refusal and an Auth outage both leave the outcome unconfirmed for this step, so the step is reported as
  // not confirmed. A defect in this service is not an Auth answer, so it propagates.
  private async callAuth<TAnswer>(
    accountId: string,
    step: UpdateStep,
    progress: EmployeeUpdateProgress,
    call: () => Promise<TAnswer>,
  ): Promise<TAnswer> {
    try {
      return await call();
    } catch (error: unknown) {
      if (!(error instanceof DomainError)) throw error;
      throw this.stopped(accountId, step, progress);
    }
  }

  // The update has saved, so a failure to read the answer is reported with the saved steps. It is not reported as a
  // lost update, because the employee was changed.
  private async readSavedEmployee(
    accountId: string,
    progress: EmployeeUpdateProgress,
  ): Promise<EmployeeDetail> {
    try {
      const record = await this.details.findEmployeeDetail(accountId);
      const account = await this.authAccounts.findAccountById(accountId);
      if (record !== undefined && account !== undefined) return toEmployeeDetail(record, account);
    } catch (error: unknown) {
      if (!(error instanceof DomainError)) throw error;
    }
    throw this.stopped(accountId, 'response', progress);
  }

  private stopped(
    accountId: string,
    step: UpdateStep,
    progress: EmployeeUpdateProgress,
  ): DependencyUnavailableError {
    this.logger.warn(`Employee update for account ${accountId} stopped at ${step}.`);
    return employeeUpdateIncompleteError(accountId, progress);
  }
}

// The lock is taken here, and the plan is computed from the locked row, so a concurrent edit is never reverted.
async function applyProfileUpdate(
  transaction: IEmployeeProfileTransaction,
  command: EmployeeUpdateCommand,
): Promise<ProfileUpdateOutcome> {
  const locked = await transaction.lockProfileForUpdate(command.accountId);
  if (locked === undefined) return { kind: 'NOT_FOUND' };
  const plan = planEmployeeUpdate(locked, command.request);
  if (plan === undefined) return { kind: 'UNCHANGED' };
  await transaction.updateFields({ accountId: command.accountId, changes: plan.changes });
  return { kind: 'SAVED', changedFields: plan.changedFields };
}

function resolveProfileOutcome(outcome: ProfileUpdateOutcome): ReadonlyArray<ProfileField> {
  switch (outcome.kind) {
    case 'NOT_FOUND':
      throw profileNotFoundError();
    case 'UNCHANGED':
      return [];
    case 'SAVED':
      return outcome.changedFields;
  }
}
