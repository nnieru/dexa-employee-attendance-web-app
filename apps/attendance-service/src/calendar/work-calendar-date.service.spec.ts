import type { WorkCalendarDate } from '@dexa/contracts';
import type {
  IWorkCalendarDateReader,
  WorkCalendarDateCriteria,
} from './work-calendar-date.repository.interface.js';
import { WorkCalendarDateService } from './work-calendar-date.service.js';

const HOLIDAY: WorkCalendarDate = {
  date: '2026-11-09',
  isWorkingDay: false,
  description: 'Holiday',
};

class RecordingDateReader implements IWorkCalendarDateReader {
  readonly criteria: WorkCalendarDateCriteria[] = [];

  constructor(
    private readonly dates: ReadonlyArray<WorkCalendarDate>,
    private readonly total: number,
  ) {}

  findDatePage(criteria: WorkCalendarDateCriteria) {
    this.criteria.push(criteria);
    return Promise.resolve({ dates: this.dates, totalItems: this.total });
  }
}

describe('WorkCalendarDateService.listDates', () => {
  it('should read the requested range and page from the reader', async () => {
    const reader = new RecordingDateReader([HOLIDAY], 1);
    const service = new WorkCalendarDateService(reader);

    await service.listDates({ from: '2026-11-01', to: '2026-11-30', page: 2, pageSize: 10 });

    expect(reader.criteria).toEqual([
      { from: '2026-11-01', to: '2026-11-30', page: 2, pageSize: 10 },
    ]);
  });

  it('should return the page with the dates the reader found, earliest first', async () => {
    const reader = new RecordingDateReader([HOLIDAY], 1);
    const service = new WorkCalendarDateService(reader);

    await expect(
      service.listDates({ from: '2026-11-01', to: '2026-11-30', page: 1, pageSize: 20 }),
    ).resolves.toEqual({
      items: [HOLIDAY],
      page: 1,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
    });
  });

  it('should return an empty page when the range has no exception', async () => {
    const service = new WorkCalendarDateService(new RecordingDateReader([], 0));

    await expect(
      service.listDates({ from: '2026-11-01', to: '2026-11-30', page: 1, pageSize: 20 }),
    ).resolves.toEqual({ items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
  });
});
