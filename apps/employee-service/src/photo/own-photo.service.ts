import type { Readable } from 'node:stream';
import { CLOCK, type IClock } from '@dexa/common';
import type { ProfileField } from '@dexa/contracts';
import { OUTBOX_WRITER, type IOutboxWriter } from '@dexa/messaging';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  EMPLOYEE_PROFILE_READER,
  type IEmployeeProfileReader,
} from '../profile/employee-profile.reader.interface.js';
import {
  EMPLOYEE_PROFILE_WRITER,
  type IEmployeeProfileTransaction,
  type IEmployeeProfileWriter,
} from '../profile/employee-profile.writer.interface.js';
import { buildEmployeeProfileUpdatedEvent } from '../profile/employee-profile-updated-event.rules.js';
import { profileNotFoundError } from '../profile/profile.errors.js';
import { PHOTO_PROCESSOR, type IPhotoProcessor } from './photo-processor.interface.js';
import { PHOTO_STORAGE, type IPhotoStorage } from './photo-storage.interface.js';
import { openStoredPhoto } from './open-stored-photo.js';
import { planOwnPhotoChange } from './own-photo.rules.js';
import type { IOwnPhotoService, OwnPhotoChangeSet } from './own-photo.service.interface.js';

// The outcome is returned rather than thrown inside the transaction, so a missing profile is reported after the
// commit of an empty transaction, and the file it left behind is removed by the caller.
type PhotoCommitOutcome =
  | { readonly status: 'PROFILE_NOT_FOUND' }
  | {
      readonly status: 'UPDATED';
      readonly replacedPhotoKey: string | null;
      readonly changedFields: ReadonlyArray<ProfileField>;
    };

@Injectable()
export class OwnPhotoService implements IOwnPhotoService {
  private readonly logger = new Logger(OwnPhotoService.name);

  constructor(
    @Inject(EMPLOYEE_PROFILE_READER) private readonly profiles: IEmployeeProfileReader,
    @Inject(EMPLOYEE_PROFILE_WRITER) private readonly writer: IEmployeeProfileWriter,
    @Inject(PHOTO_PROCESSOR) private readonly processor: IPhotoProcessor,
    @Inject(PHOTO_STORAGE) private readonly storage: IPhotoStorage,
    @Inject(OUTBOX_WRITER) private readonly outbox: IOutboxWriter,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  // The order is part of the contract (DATABASE §4.2): the file is durable before its key commits, and the replaced
  // file is removed only after the commit, so the stored profile never refers to a missing file.
  async replacePhoto(accountId: string, upload: Buffer): Promise<OwnPhotoChangeSet> {
    const photo = await this.processor.normalizePhoto(upload);
    const photoKey = await this.storage.save(photo);
    const outcome = await this.commitPhoto(accountId, photoKey);
    if (outcome.status === 'PROFILE_NOT_FOUND') {
      await this.removePhotoBestEffort(photoKey);
      throw profileNotFoundError();
    }
    if (outcome.replacedPhotoKey !== null)
      await this.removePhotoBestEffort(outcome.replacedPhotoKey);
    return { changedFields: outcome.changedFields };
  }

  async getOwnPhoto(accountId: string): Promise<Readable> {
    const profile = await this.profiles.findProfileByAccountId(accountId);
    if (profile === undefined) throw profileNotFoundError();
    return openStoredPhoto(this.storage, profile.photoKey);
  }

  // A failed commit may have happened after the database made it durable, so the new file is kept. Its key is
  // logged so an operator can remove it if no profile refers to it.
  private async commitPhoto(accountId: string, photoKey: string): Promise<PhotoCommitOutcome> {
    try {
      return await this.writer.runInTransaction((transaction) =>
        this.applyPhotoChange(transaction, accountId, photoKey),
      );
    } catch (error: unknown) {
      this.logger.error(
        `Photo commit failed; file ${photoKey} may be unreferenced and needs operator cleanup.`,
      );
      throw error;
    }
  }

  // The file is already unreferenced when this runs, so a failed removal only leaves an orphan for operators.
  private async removePhotoBestEffort(photoKey: string): Promise<void> {
    try {
      await this.storage.remove(photoKey);
    } catch (error: unknown) {
      this.logger.warn(
        `Could not remove photo file ${photoKey} (${error instanceof Error ? error.name : 'unknown error'}).`,
      );
    }
  }

  // The row lock serializes concurrent photo and phone edits, so the status decision sees the stored fields.
  // The event joins the transaction, so a rolled-back photo change leaves no event. The file was saved before
  // this transaction (DATABASE §4.2), so a rollback leaves the file behind for operators, as before.
  private async applyPhotoChange(
    transaction: IEmployeeProfileTransaction,
    accountId: string,
    photoKey: string,
  ): Promise<PhotoCommitOutcome> {
    const stored = await transaction.lockProfileForUpdate(accountId);
    if (stored === undefined) return { status: 'PROFILE_NOT_FOUND' };
    const plan = planOwnPhotoChange(stored, photoKey);
    await transaction.updatePhoto({
      accountId,
      photoKey,
      profileStatus: plan.profileStatus,
    });
    await this.outbox.add(
      transaction,
      buildEmployeeProfileUpdatedEvent({
        eventId: randomUUID(),
        occurredAt: this.clock.now(),
        accountId,
        actorAccountId: accountId,
        employeeName: stored.name,
        changedFields: plan.changedFields,
      }),
    );
    return {
      status: 'UPDATED',
      replacedPhotoKey: stored.photoKey,
      changedFields: plan.changedFields,
    };
  }
}
