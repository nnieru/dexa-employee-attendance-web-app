import type { IClock } from '@dexa/common';
import type { WorkScheduleVersion } from '@dexa/contracts';
import type { IWorkScheduleVersionReader } from './work-schedule.repository.interface.js';
import { WorkScheduleService } from './work-schedule.service.js';

const TIMEZONE = 'Asia/Jakarta';
// 17:30 UTC on 1 Nov is 00:30 WIB on 2 Nov, so the business date differs from the UTC date.
const LATE_NIGHT_WIB_INSTANT = new Date('2026-11-01T17:30:00Z');

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
  effectiveUntil: null,
};

class RecordingVersionReader implements IWorkScheduleVersionReader {
  readonly businessDates: string[] = [];

  constructor(private readonly versions: ReadonlyArray<WorkScheduleVersion>) {}

  findInEffectOrUpcoming(businessDate: string): Promise<ReadonlyArray<WorkScheduleVersion>> {
    this.businessDates.push(businessDate);
    return Promise.resolve(this.versions);
  }
}

describe('WorkScheduleService.getScheduleOverview', () => {
  it('should judge the versions on the business date in the business timezone', async () => {
    const reader = new RecordingVersionReader([CURRENT_VERSION]);
    const clock: IClock = { now: () => new Date(LATE_NIGHT_WIB_INSTANT) };
    const service = new WorkScheduleService(reader, clock, { BUSINESS_TIMEZONE: TIMEZONE });

    await service.getScheduleOverview();

    expect(reader.businessDates).toEqual(['2026-11-02']);
  });

  it('should return the version in effect and no upcoming version when the reader has only that version', async () => {
    const reader = new RecordingVersionReader([CURRENT_VERSION]);
    const clock: IClock = { now: () => new Date(LATE_NIGHT_WIB_INSTANT) };
    const service = new WorkScheduleService(reader, clock, { BUSINESS_TIMEZONE: TIMEZONE });

    await expect(service.getScheduleOverview()).resolves.toEqual({
      current: CURRENT_VERSION,
      upcoming: null,
    });
  });
});
