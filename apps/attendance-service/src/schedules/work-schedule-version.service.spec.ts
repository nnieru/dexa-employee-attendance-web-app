import type { IClock } from '@dexa/common';
import type { WorkScheduleVersion, WorkScheduleVersionRequest } from '@dexa/contracts';
import {
  UpcomingWorkScheduleExistsError,
  WorkScheduleEffectiveFromTooEarlyError,
  WorkScheduleVersionNotFoundError,
  WorkScheduleVersionNotUpcomingError,
} from './work-schedule.errors.js';
import type {
  IWorkScheduleVersionTransaction,
  IWorkScheduleVersionWriter,
  NewWorkSchedule,
} from './work-schedule.repository.interface.js';
import { WorkScheduleVersionService } from './work-schedule-version.service.js';

const TIMEZONE = 'Asia/Jakarta';
// 01:00 UTC on 3 Nov is 08:00 WIB on 3 Nov, so today is 2026-11-03 in the business timezone.
const CLOCK_INSTANT = new Date('2026-11-03T01:00:00Z');

const CURRENT_VERSION: WorkScheduleVersion = {
  id: '5f3c2a1e-7b4d-4c8e-9a6f-2d1b0e9c8a7f',
  name: 'Default company schedule',
  timezone: TIMEZONE,
  workingWeekdays: [1, 2, 3, 4, 5],
  startTime: '09:00',
  endTime: '18:00',
  lateCheckinGraceMinutes: 15,
  earlyCheckoutGraceMinutes: 0,
  lateCheckoutGraceMinutes: 0,
  effectiveFrom: '2026-11-02',
  effectiveUntil: '2026-11-16',
};

const UPCOMING_VERSION: WorkScheduleVersion = {
  ...CURRENT_VERSION,
  id: '0b9e8d7c-6a5f-4e3d-8c2b-1a0f9e8d7c6b',
  name: 'Shortened company schedule',
  startTime: '08:30',
  effectiveFrom: '2026-11-16',
  effectiveUntil: null,
};

const REQUEST: WorkScheduleVersionRequest = {
  workingWeekdays: [1, 3, 5],
  startTime: '08:00',
  endTime: '16:00',
  lateCheckinGraceMinutes: 0,
  earlyCheckoutGraceMinutes: 0,
  lateCheckoutGraceMinutes: 0,
  effectiveFrom: '2026-11-20',
};

// Keeps the versions in a list and reads them the way the repository does. The service decides before it writes,
// so no test needs a rollback.
class InMemoryVersionWriter implements IWorkScheduleVersionWriter {
  versions: WorkScheduleVersion[];

  constructor(versions: ReadonlyArray<WorkScheduleVersion>) {
    this.versions = [...versions];
  }

  runInTransaction<TResult>(
    work: (transaction: IWorkScheduleVersionTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    return work(this.createScope());
  }

  private createScope(): IWorkScheduleVersionTransaction {
    const byEffectiveFromDescending = (left: WorkScheduleVersion, right: WorkScheduleVersion) =>
      right.effectiveFrom.localeCompare(left.effectiveFrom);
    return {
      findLatestVersionForUpdate: () =>
        Promise.resolve([...this.versions].sort(byEffectiveFromDescending)[0]),
      findVersionForUpdate: (versionId) =>
        Promise.resolve(this.versions.find((version) => version.id === versionId)),
      findPreviousVersionForUpdate: (effectiveFrom) =>
        Promise.resolve(
          [...this.versions]
            .filter((version) => version.effectiveFrom < effectiveFrom)
            .sort(byEffectiveFromDescending)[0],
        ),
      setEffectiveUntil: (versionId, effectiveUntil) => {
        this.replace(versionId, { effectiveUntil });
        return Promise.resolve();
      },
      insertOpenEndedVersion: (values) => {
        const inserted = toVersion('11111111-1111-4111-8111-111111111111', values);
        this.versions.push(inserted);
        return Promise.resolve(inserted);
      },
      updateVersion: (versionId, values) => {
        const updated = toVersion(versionId, values);
        this.replace(versionId, updated);
        return Promise.resolve(updated);
      },
    };
  }

  private replace(versionId: string, changes: Partial<WorkScheduleVersion>): void {
    this.versions = this.versions.map((version) =>
      version.id === versionId ? { ...version, ...changes } : version,
    );
  }
}

function toVersion(id: string, values: NewWorkSchedule): WorkScheduleVersion {
  return { ...values, id, effectiveUntil: null, workingWeekdays: [...values.workingWeekdays] };
}

function createService(versions: ReadonlyArray<WorkScheduleVersion>): {
  readonly service: WorkScheduleVersionService;
  readonly writer: InMemoryVersionWriter;
} {
  const writer = new InMemoryVersionWriter(versions);
  const clock: IClock = { now: () => new Date(CLOCK_INSTANT) };
  const service = new WorkScheduleVersionService(writer, clock, { BUSINESS_TIMEZONE: TIMEZONE });
  return { service, writer };
}

describe('WorkScheduleVersionService.createVersion', () => {
  it('should end the version in effect on the new date and insert an open-ended version', async () => {
    const { service, writer } = createService([CURRENT_VERSION]);

    const created = await service.createVersion({ ...REQUEST, effectiveFrom: '2026-11-10' });

    expect(created).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      name: CURRENT_VERSION.name,
      timezone: TIMEZONE,
      workingWeekdays: [1, 3, 5],
      startTime: '08:00',
      endTime: '16:00',
      lateCheckinGraceMinutes: 0,
      earlyCheckoutGraceMinutes: 0,
      lateCheckoutGraceMinutes: 0,
      effectiveFrom: '2026-11-10',
      effectiveUntil: null,
    });
    expect(writer.versions).toContainEqual(
      expect.objectContaining({ id: CURRENT_VERSION.id, effectiveUntil: '2026-11-10' }),
    );
  });

  it('should refuse a create when an upcoming version already exists and write nothing', async () => {
    const { service, writer } = createService([CURRENT_VERSION, UPCOMING_VERSION]);

    await expect(
      service.createVersion({ ...REQUEST, effectiveFrom: '2026-11-25' }),
    ).rejects.toThrow(UpcomingWorkScheduleExistsError);
    expect(writer.versions).toEqual([CURRENT_VERSION, UPCOMING_VERSION]);
  });

  it.each([
    { condition: 'the effective date is today', effectiveFrom: '2026-11-03' },
    { condition: 'the effective date is in the past', effectiveFrom: '2026-11-01' },
  ])('should refuse a create when $condition and write nothing', async ({ effectiveFrom }) => {
    const { service, writer } = createService([CURRENT_VERSION]);

    await expect(service.createVersion({ ...REQUEST, effectiveFrom })).rejects.toThrow(
      WorkScheduleEffectiveFromTooEarlyError,
    );
    expect(writer.versions).toEqual([CURRENT_VERSION]);
  });
});

describe('WorkScheduleVersionService.updateVersion', () => {
  it('should refuse an unknown version id', async () => {
    const { service } = createService([CURRENT_VERSION, UPCOMING_VERSION]);

    await expect(
      service.updateVersion('9f1e2d3c-4b5a-4687-8978-6a5b4c3d2e1f', REQUEST),
    ).rejects.toThrow(WorkScheduleVersionNotFoundError);
  });

  it('should refuse to edit the version in effect and write nothing', async () => {
    const { service, writer } = createService([CURRENT_VERSION, UPCOMING_VERSION]);

    await expect(service.updateVersion(CURRENT_VERSION.id, REQUEST)).rejects.toThrow(
      WorkScheduleVersionNotUpcomingError,
    );
    expect(writer.versions).toEqual([CURRENT_VERSION, UPCOMING_VERSION]);
  });

  it('should refuse an effective date that is not tomorrow or later and write nothing', async () => {
    const { service, writer } = createService([CURRENT_VERSION, UPCOMING_VERSION]);

    await expect(
      service.updateVersion(UPCOMING_VERSION.id, { ...REQUEST, effectiveFrom: '2026-11-03' }),
    ).rejects.toThrow(WorkScheduleEffectiveFromTooEarlyError);
    expect(writer.versions).toEqual([CURRENT_VERSION, UPCOMING_VERSION]);
  });

  it('should replace the upcoming version and move the end of the previous version with its start', async () => {
    const { service, writer } = createService([CURRENT_VERSION, UPCOMING_VERSION]);

    const updated = await service.updateVersion(UPCOMING_VERSION.id, REQUEST);

    expect(updated).toEqual({
      id: UPCOMING_VERSION.id,
      name: UPCOMING_VERSION.name,
      timezone: TIMEZONE,
      workingWeekdays: [1, 3, 5],
      startTime: '08:00',
      endTime: '16:00',
      lateCheckinGraceMinutes: 0,
      earlyCheckoutGraceMinutes: 0,
      lateCheckoutGraceMinutes: 0,
      effectiveFrom: '2026-11-20',
      effectiveUntil: null,
    });
    expect(writer.versions).toContainEqual(
      expect.objectContaining({ id: CURRENT_VERSION.id, effectiveUntil: '2026-11-20' }),
    );
  });
});
