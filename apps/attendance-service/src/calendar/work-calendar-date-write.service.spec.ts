import { type IClock } from '@dexa/common';
import type { WorkCalendarDate } from '@dexa/contracts';
import {
  WorkCalendarDateNotFoundError,
  WorkCalendarDateNotFutureError,
} from './work-calendar-date.errors.js';
import type {
  IWorkCalendarDateWriter,
  NewWorkCalendarDate,
} from './work-calendar-date.repository.interface.js';
import { WorkCalendarDateWriteService } from './work-calendar-date-write.service.js';

const TIMEZONE = 'Asia/Jakarta';
// 01:00 UTC on 2 Nov is 08:00 WIB on Monday 2 Nov, so today is 2026-11-02 in the business timezone.
const MONDAY_MORNING_INSTANT = new Date('2026-11-02T01:00:00Z');
const NEXT_MONDAY = '2026-11-09';

class FakeClock implements IClock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current);
  }

  set(instant: Date): void {
    this.current = instant;
  }
}

// Keeps the stored exceptions in a map, so a test sees what the service asked the repository to store or delete.
class FakeDateWriter implements IWorkCalendarDateWriter {
  readonly stored = new Map<string, WorkCalendarDate>();

  upsertDate(values: NewWorkCalendarDate): Promise<WorkCalendarDate> {
    const saved = {
      date: values.date,
      isWorkingDay: values.isWorkingDay,
      description: values.description,
    };
    this.stored.set(values.date, saved);
    return Promise.resolve(saved);
  }

  deleteDate(date: string): Promise<boolean> {
    return Promise.resolve(this.stored.delete(date));
  }
}

function createService(clock: FakeClock, writer: FakeDateWriter): WorkCalendarDateWriteService {
  return new WorkCalendarDateWriteService(writer, clock, { BUSINESS_TIMEZONE: TIMEZONE });
}

describe('WorkCalendarDateWriteService.upsertDate', () => {
  it('should store the exception for a date after today', async () => {
    const writer = new FakeDateWriter();
    const service = createService(new FakeClock(MONDAY_MORNING_INSTANT), writer);

    const saved = await service.upsertDate(NEXT_MONDAY, {
      isWorkingDay: false,
      description: 'Holiday',
    });

    expect(saved).toEqual({ date: NEXT_MONDAY, isWorkingDay: false, description: 'Holiday' });
    expect(writer.stored.get(NEXT_MONDAY)).toEqual(saved);
  });

  it('should store an exception that matches the regular schedule, since D-44 keeps it', async () => {
    const writer = new FakeDateWriter();
    const service = createService(new FakeClock(MONDAY_MORNING_INSTANT), writer);

    // 2026-11-07 is a Saturday, a regular day off, so this exception adds no change to the schedule.
    await service.upsertDate('2026-11-07', { isWorkingDay: false });

    expect(writer.stored.get('2026-11-07')).toEqual({
      date: '2026-11-07',
      isWorkingDay: false,
      description: null,
    });
  });

  it('should refuse a date that is today in the business timezone with a not-future error', async () => {
    const writer = new FakeDateWriter();
    const service = createService(new FakeClock(MONDAY_MORNING_INSTANT), writer);

    await expect(service.upsertDate('2026-11-02', { isWorkingDay: false })).rejects.toBeInstanceOf(
      WorkCalendarDateNotFutureError,
    );
    expect(writer.stored.size).toBe(0);
  });

  it('should judge today by the business timezone, not the UTC date', async () => {
    const writer = new FakeDateWriter();
    // 17:30 UTC on 1 Nov is 00:30 WIB on 2 Nov, so 2 Nov is already today and 3 Nov is the first editable date.
    const service = createService(new FakeClock(new Date('2026-11-01T17:30:00Z')), writer);

    await expect(service.upsertDate('2026-11-02', { isWorkingDay: false })).rejects.toBeInstanceOf(
      WorkCalendarDateNotFutureError,
    );
    await expect(service.upsertDate('2026-11-03', { isWorkingDay: false })).resolves.toMatchObject({
      date: '2026-11-03',
    });
  });

  it('should refuse a past date with a not-future error', async () => {
    const writer = new FakeDateWriter();
    const service = createService(new FakeClock(MONDAY_MORNING_INSTANT), writer);

    await expect(service.upsertDate('2026-10-30', { isWorkingDay: true })).rejects.toBeInstanceOf(
      WorkCalendarDateNotFutureError,
    );
  });

  it('should allow the date once the clock has moved past it', async () => {
    const writer = new FakeDateWriter();
    const clock = new FakeClock(MONDAY_MORNING_INSTANT);
    const service = createService(clock, writer);

    await expect(service.upsertDate(NEXT_MONDAY, { isWorkingDay: false })).resolves.toBeDefined();
    clock.set(new Date('2026-11-09T01:00:00Z'));
    await expect(service.upsertDate(NEXT_MONDAY, { isWorkingDay: true })).rejects.toBeInstanceOf(
      WorkCalendarDateNotFutureError,
    );
  });
});

describe('WorkCalendarDateWriteService.deleteDate', () => {
  it('should remove the exception for a date after today', async () => {
    const writer = new FakeDateWriter();
    const service = createService(new FakeClock(MONDAY_MORNING_INSTANT), writer);
    await service.upsertDate(NEXT_MONDAY, { isWorkingDay: false });

    await service.deleteDate(NEXT_MONDAY);

    expect(writer.stored.has(NEXT_MONDAY)).toBe(false);
  });

  it('should refuse a date that has no exception with a not-found error', async () => {
    const service = createService(new FakeClock(MONDAY_MORNING_INSTANT), new FakeDateWriter());

    await expect(service.deleteDate(NEXT_MONDAY)).rejects.toBeInstanceOf(
      WorkCalendarDateNotFoundError,
    );
  });

  it('should refuse a past date with a not-future error, even when it has an exception', async () => {
    const writer = new FakeDateWriter();
    writer.stored.set('2026-10-30', { date: '2026-10-30', isWorkingDay: false, description: null });
    const service = createService(new FakeClock(MONDAY_MORNING_INSTANT), writer);

    await expect(service.deleteDate('2026-10-30')).rejects.toBeInstanceOf(
      WorkCalendarDateNotFutureError,
    );
    expect(writer.stored.has('2026-10-30')).toBe(true);
  });

  it('should refuse today with a not-future error', async () => {
    const service = createService(new FakeClock(MONDAY_MORNING_INSTANT), new FakeDateWriter());

    await expect(service.deleteDate('2026-11-02')).rejects.toBeInstanceOf(
      WorkCalendarDateNotFutureError,
    );
  });
});
