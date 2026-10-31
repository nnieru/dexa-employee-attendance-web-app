import { CLOCK, toBusinessDate, type IClock } from '@dexa/common';
import type { WorkScheduleVersion, WorkScheduleVersionRequest } from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { CONFIG } from '../config/config.token.js';
import type { AttendanceServiceConfig } from '../config/attendance-service-config.schema.js';
import { DEFAULT_WORK_SCHEDULE_NAME } from './default-work-schedule.rules.js';
import {
  UpcomingWorkScheduleExistsError,
  WorkScheduleEffectiveFromTooEarlyError,
  WorkScheduleVersionNotFoundError,
  WorkScheduleVersionNotUpcomingError,
} from './work-schedule.errors.js';
import {
  WORK_SCHEDULE_VERSION_WRITER,
  type IWorkScheduleVersionTransaction,
  type IWorkScheduleVersionWriter,
} from './work-schedule.repository.interface.js';
import {
  buildWorkScheduleValues,
  isEffectiveFromAllowed,
  isUpcomingVersion,
} from './work-schedule.rules.js';
import type { IWorkScheduleVersionService } from './work-schedule-version.service.interface.js';

@Injectable()
export class WorkScheduleVersionService implements IWorkScheduleVersionService {
  constructor(
    @Inject(WORK_SCHEDULE_VERSION_WRITER) private readonly versions: IWorkScheduleVersionWriter,
    @Inject(CLOCK) private readonly clock: IClock,
    @Inject(CONFIG) private readonly config: Pick<AttendanceServiceConfig, 'BUSINESS_TIMEZONE'>,
  ) {}

  // Only one upcoming version may exist, so the latest version is the one to check. When it is in effect, it is
  // superseded on the new effective date, and the new version is open-ended.
  createVersion(request: WorkScheduleVersionRequest): Promise<WorkScheduleVersion> {
    const businessDate = toBusinessDate(this.clock.now(), this.config.BUSINESS_TIMEZONE);
    return this.versions.runInTransaction(async (transaction) => {
      const latest = await transaction.findLatestVersionForUpdate();
      if (latest !== undefined && isUpcomingVersion(latest, businessDate)) {
        throw new UpcomingWorkScheduleExistsError();
      }
      if (!isEffectiveFromAllowed(request.effectiveFrom, businessDate)) {
        throw new WorkScheduleEffectiveFromTooEarlyError();
      }
      if (latest !== undefined) {
        await transaction.setEffectiveUntil(latest.id, request.effectiveFrom);
      }
      return transaction.insertOpenEndedVersion(
        buildWorkScheduleValues({
          request,
          timezone: this.config.BUSINESS_TIMEZONE,
          name: latest?.name ?? DEFAULT_WORK_SCHEDULE_NAME,
        }),
      );
    });
  }

  // The version in effect never changes. The previous version ends where the edited one starts, so the two stay
  // contiguous when the effective date moves.
  updateVersion(
    versionId: string,
    request: WorkScheduleVersionRequest,
  ): Promise<WorkScheduleVersion> {
    const businessDate = toBusinessDate(this.clock.now(), this.config.BUSINESS_TIMEZONE);
    return this.versions.runInTransaction(async (transaction) => {
      const version = await transaction.findVersionForUpdate(versionId);
      if (version === undefined) throw new WorkScheduleVersionNotFoundError();
      if (!isUpcomingVersion(version, businessDate))
        throw new WorkScheduleVersionNotUpcomingError();
      if (!isEffectiveFromAllowed(request.effectiveFrom, businessDate)) {
        throw new WorkScheduleEffectiveFromTooEarlyError();
      }
      const previous = await transaction.findPreviousVersionForUpdate(version.effectiveFrom);
      const values = buildWorkScheduleValues({
        request,
        timezone: this.config.BUSINESS_TIMEZONE,
        name: version.name,
      });
      // The exclusion constraint checks each row as it is written, so the write that frees the shared dates goes first.
      // A later start frees dates for the previous version to end on. An earlier start frees them for the edited version.
      if (request.effectiveFrom > version.effectiveFrom) {
        const updated = await transaction.updateVersion(version.id, values);
        await endPreviousVersion(transaction, previous, request.effectiveFrom);
        return updated;
      }
      await endPreviousVersion(transaction, previous, request.effectiveFrom);
      return transaction.updateVersion(version.id, values);
    });
  }
}

async function endPreviousVersion(
  transaction: IWorkScheduleVersionTransaction,
  previous: WorkScheduleVersion | undefined,
  effectiveUntil: string,
): Promise<void> {
  if (previous === undefined) return;
  await transaction.setEffectiveUntil(previous.id, effectiveUntil);
}
