import type { ProfileField, UpdateOwnProfileRequest } from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import {
  EMPLOYEE_PROFILE_WRITER,
  type IEmployeeProfileTransaction,
  type IEmployeeProfileWriter,
} from './employee-profile.writer.interface.js';
import { profileNotFoundError } from './profile.errors.js';
import { planOwnPhoneChange } from './own-phone.rules.js';
import type { IOwnPhoneService, OwnPhoneChangeSet } from './own-phone.service.interface.js';

// The outcome is returned rather than thrown inside the transaction, so a missing profile is reported
// after the rollback and the rule for a no-op is decided in one place.
type OwnPhoneOutcome =
  | { readonly status: 'PROFILE_NOT_FOUND' }
  | { readonly status: 'NO_CHANGE' }
  | { readonly status: 'UPDATED'; readonly changedFields: ReadonlyArray<ProfileField> };

@Injectable()
export class OwnPhoneService implements IOwnPhoneService {
  constructor(@Inject(EMPLOYEE_PROFILE_WRITER) private readonly profiles: IEmployeeProfileWriter) {}

  async updatePhone(
    accountId: string,
    request: UpdateOwnProfileRequest,
  ): Promise<OwnPhoneChangeSet> {
    const outcome = await this.profiles.runInTransaction((transaction) =>
      applyPhoneChange(transaction, accountId, request.phoneNumber),
    );
    if (outcome.status === 'PROFILE_NOT_FOUND') throw profileNotFoundError();
    if (outcome.status === 'NO_CHANGE') return { changedFields: [] };
    return { changedFields: outcome.changedFields };
  }
}

async function applyPhoneChange(
  transaction: IEmployeeProfileTransaction,
  accountId: string,
  phoneNumber: string | null,
): Promise<OwnPhoneOutcome> {
  const stored = await transaction.lockProfileForUpdate(accountId);
  if (stored === undefined) return { status: 'PROFILE_NOT_FOUND' };
  const plan = planOwnPhoneChange(stored, phoneNumber);
  if (plan === undefined) return { status: 'NO_CHANGE' };
  await transaction.updatePhone({
    accountId,
    phoneNumber: plan.phoneNumber,
    profileStatus: plan.profileStatus,
  });
  return { status: 'UPDATED', changedFields: plan.changedFields };
}
