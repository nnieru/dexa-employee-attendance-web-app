import { CLOCK, ConflictError, ForbiddenError, NotFoundError, type IClock } from '@dexa/common';
import {
  ErrorCode,
  type AccountStatus,
  type ResetAccountPasswordRequest,
  type SetAccountActiveStatusRequest,
} from '@dexa/contracts';
import { OUTBOX_WRITER, type IOutboxWriter } from '@dexa/messaging';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PASSWORD_HASHER, type IPasswordHasher } from '../credentials/password-hasher.interface.js';
import { buildPasswordChangedEvent } from '../password/password-changed-event.rules.js';
import { isEligibleHrActor } from './hr-actor.rules.js';
import { isAdministrableAccount, isSelfDeactivation } from './account-administration.rules.js';
import type { IAccountAdministrationService } from './account-administration.service.interface.js';
import {
  ACCOUNT_ADMINISTRATION_REPOSITORY,
  type IAccountAdministrationRepository,
} from './account-administration.repository.interface.js';
import { ACCOUNT_REPOSITORY, type IAccountRepository } from './account.repository.interface.js';

const ACTOR_NOT_ELIGIBLE_MESSAGE = 'Only an active HR account can change other accounts.';
const ACCOUNT_NOT_FOUND_MESSAGE = 'The account was not found.';
const SELF_DEACTIVATION_MESSAGE = 'An HR account cannot deactivate its own account.';

// The outcome is returned rather than thrown inside the transaction, so a missing account is reported
// after the transaction without the error passing through the repository's write-error mapping.
type ResetOutcome = 'RESET' | 'MISSING';

@Injectable()
export class AccountAdministrationService implements IAccountAdministrationService {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: IAccountRepository,
    @Inject(ACCOUNT_ADMINISTRATION_REPOSITORY)
    private readonly administration: IAccountAdministrationRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: IPasswordHasher,
    @Inject(OUTBOX_WRITER) private readonly outbox: IOutboxWriter,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async resetPassword(accountId: string, request: ResetAccountPasswordRequest): Promise<void> {
    await this.assertEligibleActor(request.actorAccountId);
    await this.assertAdministrableAccount(accountId);
    // Hashing runs outside the transaction because argon2 is slow.
    const passwordHash = await this.passwordHasher.hash(request.newPassword);
    const event = buildPasswordChangedEvent({
      eventId: randomUUID(),
      occurredAt: this.clock.now(),
      accountId,
      actorAccountId: request.actorAccountId,
    });
    const outcome = await this.administration.runInTransaction(
      async (transaction): Promise<ResetOutcome> => {
        const isReplaced = await transaction.replacePasswordHash(accountId, passwordHash);
        if (!isReplaced) return 'MISSING';
        await this.outbox.add(transaction, event);
        return 'RESET';
      },
    );
    if (outcome === 'MISSING') {
      throw new NotFoundError(ErrorCode.NOT_FOUND, ACCOUNT_NOT_FOUND_MESSAGE);
    }
  }

  // No event type describes an active-status change, so this path writes no outbox row.
  async setActiveStatus(
    accountId: string,
    request: SetAccountActiveStatusRequest,
  ): Promise<AccountStatus> {
    await this.assertEligibleActor(request.actorAccountId);
    if (
      isSelfDeactivation({
        actorAccountId: request.actorAccountId,
        targetAccountId: accountId,
        isActive: request.isActive,
      })
    ) {
      throw new ConflictError(ErrorCode.CONFLICT, SELF_DEACTIVATION_MESSAGE);
    }
    await this.assertAdministrableAccount(accountId);
    const isActive = await this.administration.updateIsActive(accountId, request.isActive);
    if (isActive === undefined) {
      throw new NotFoundError(ErrorCode.NOT_FOUND, ACCOUNT_NOT_FOUND_MESSAGE);
    }
    return { isActive };
  }

  private async assertEligibleActor(actorAccountId: string): Promise<void> {
    const actor = await this.accounts.findAccountById(actorAccountId);
    if (!isEligibleHrActor(actor)) {
      throw new ForbiddenError(ErrorCode.FORBIDDEN, ACTOR_NOT_ELIGIBLE_MESSAGE);
    }
  }

  private async assertAdministrableAccount(accountId: string): Promise<void> {
    const account = await this.accounts.findAccountById(accountId);
    if (!isAdministrableAccount(account)) {
      throw new NotFoundError(ErrorCode.NOT_FOUND, ACCOUNT_NOT_FOUND_MESSAGE);
    }
  }
}
