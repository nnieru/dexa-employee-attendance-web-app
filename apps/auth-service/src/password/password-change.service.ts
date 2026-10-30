import {
  CLOCK,
  ConflictError,
  UnauthorizedError,
  ValidationError,
  type IClock,
} from '@dexa/common';
import { ErrorCode, type ChangePasswordRequest } from '@dexa/contracts';
import { OUTBOX_WRITER, type IOutboxWriter } from '@dexa/messaging';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PASSWORD_HASHER, type IPasswordHasher } from '../credentials/password-hasher.interface.js';
import { buildPasswordChangedEvent } from './password-changed-event.rules.js';
import type { IPasswordChangeService } from './password-change-service.interface.js';
import {
  PASSWORD_CHANGE_REPOSITORY,
  type IPasswordChangeRepository,
  type PasswordCredentialRecord,
} from './password-change.repository.interface.js';

const SESSION_NOT_FOUND_MESSAGE = 'Your session is no longer valid. Sign in again.';
const ACCOUNT_DISABLED_MESSAGE = 'This account has been deactivated.';
const CURRENT_PASSWORD_INCORRECT_MESSAGE = 'The current password is incorrect.';
const PASSWORD_CHANGED_BY_ANOTHER_REQUEST_MESSAGE =
  'The password was changed by another request. Try again.';

// The outcome is returned rather than thrown inside the transaction, so the outbox row is written
// only for a password that was actually replaced. A stale change is reported after the transaction.
type ReplacementOutcome = 'REPLACED' | 'STALE';

@Injectable()
export class PasswordChangeService implements IPasswordChangeService {
  constructor(
    @Inject(PASSWORD_CHANGE_REPOSITORY) private readonly passwords: IPasswordChangeRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: IPasswordHasher,
    @Inject(OUTBOX_WRITER) private readonly outbox: IOutboxWriter,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async changePassword(accountId: string, request: ChangePasswordRequest): Promise<void> {
    const credential = await this.passwords.findCredentialByAccountId(accountId);
    assertCanChangePassword(credential);
    const isCurrentPasswordMatching = await this.passwordHasher.verify(
      credential.passwordHash,
      request.currentPassword,
    );
    if (!isCurrentPasswordMatching) {
      throw new ValidationError(
        ErrorCode.CURRENT_PASSWORD_INCORRECT,
        CURRENT_PASSWORD_INCORRECT_MESSAGE,
      );
    }
    // Hashing runs outside the transaction because argon2 is slow.
    const newPasswordHash = await this.passwordHasher.hash(request.newPassword);
    const event = buildPasswordChangedEvent({
      eventId: randomUUID(),
      occurredAt: this.clock.now(),
      accountId,
      actorAccountId: accountId,
    });
    const outcome = await this.passwords.runInTransaction(
      async (transaction): Promise<ReplacementOutcome> => {
        const isReplaced = await transaction.replacePasswordHash({
          accountId,
          previousPasswordHash: credential.passwordHash,
          newPasswordHash,
        });
        if (!isReplaced) return 'STALE';
        await this.outbox.add(transaction, event);
        return 'REPLACED';
      },
    );
    if (outcome === 'STALE') {
      throw new ConflictError(ErrorCode.CONFLICT, PASSWORD_CHANGED_BY_ANOTHER_REQUEST_MESSAGE);
    }
  }
}

// A missing or still-provisioning account is no session, and a deactivated one gets its own code so
// the client signs out (D-13). Both are refused before the password is checked.
function assertCanChangePassword(
  credential: PasswordCredentialRecord | undefined,
): asserts credential is PasswordCredentialRecord {
  if (credential === undefined || credential.isProvisioningPending) {
    throw new UnauthorizedError(ErrorCode.UNAUTHORIZED, SESSION_NOT_FOUND_MESSAGE);
  }
  if (!credential.isActive) {
    throw new UnauthorizedError(ErrorCode.ACCOUNT_DISABLED, ACCOUNT_DISABLED_MESSAGE);
  }
}
