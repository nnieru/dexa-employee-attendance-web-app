import { ValidationError, type IClock } from '@dexa/common';
import { ErrorCode, type AttendanceSummaryQuery } from '@dexa/contracts';
import {
  type AttendanceSummaryCriteria,
  type AttendanceSummaryRecord,
  type AttendanceSummaryRecordPage,
  type IAttendanceSummaryReader,
} from './attendance-summary.repository.interface.js';
import { AttendanceSummaryService } from './attendance-summary.service.js';

const ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const TIMEZONE = 'Asia/Jakarta';

// 17:30 UTC on 2026-10-31 is 00:30 WIB on 2026-11-01, so the business month has already turned.
const NOVEMBER_FIRST_WIB_INSTANT = new Date('2026-10-31T17:30:00Z');
// 16:59 UTC on 2026-10-31 is 23:59 WIB on 2026-10-31, still October.
const LAST_MINUTE_OCTOBER_WIB_INSTANT = new Date('2026-10-31T16:59:00Z');

class RecordingAttendanceSummaryReader implements IAttendanceSummaryReader {
  readonly criteria: AttendanceSummaryCriteria[] = [];

  constructor(private readonly page: AttendanceSummaryRecordPage) {}

  findDayPage(criteria: AttendanceSummaryCriteria): Promise<AttendanceSummaryRecordPage> {
    this.criteria.push(criteria);
    return Promise.resolve(this.page);
  }
}

function clockAt(instant: Date): IClock {
  return { now: () => new Date(instant) };
}

function createService(options: {
  readonly instant: Date;
  readonly reader: IAttendanceSummaryReader;
}): AttendanceSummaryService {
  return new AttendanceSummaryService(options.reader, clockAt(options.instant), {
    BUSINESS_TIMEZONE: TIMEZONE,
  });
}

const QUERY_WITHOUT_RANGE: AttendanceSummaryQuery = { page: 1, pageSize: 20 };

describe('AttendanceSummaryService.listOwnSummary', () => {
  it.each([
    {
      condition: 'the clock is 00:30 WIB on the first of November',
      instant: NOVEMBER_FIRST_WIB_INSTANT,
      expectedFrom: '2026-11-01',
      expectedTo: '2026-11-01',
    },
    {
      condition: 'the clock is 23:59 WIB on the last day of October',
      instant: LAST_MINUTE_OCTOBER_WIB_INSTANT,
      expectedFrom: '2026-10-01',
      expectedTo: '2026-10-31',
    },
  ])(
    'should search from the first of the business month to today when $condition',
    async ({ instant, expectedFrom, expectedTo }) => {
      const reader = new RecordingAttendanceSummaryReader(emptyPage());
      const service = createService({ instant, reader });

      await service.listOwnSummary(ACCOUNT_ID, QUERY_WITHOUT_RANGE);

      expect(reader.criteria).toEqual([
        { accountId: ACCOUNT_ID, from: expectedFrom, to: expectedTo, page: 1, pageSize: 20 },
      ]);
    },
  );

  it('should search the range the employee gave without reading the default from the clock', async () => {
    const reader = new RecordingAttendanceSummaryReader(emptyPage());
    const service = createService({ instant: NOVEMBER_FIRST_WIB_INSTANT, reader });

    await service.listOwnSummary(ACCOUNT_ID, {
      from: '2026-09-01',
      to: '2026-09-30',
      page: 2,
      pageSize: 5,
    });

    expect(reader.criteria).toEqual([
      { accountId: ACCOUNT_ID, from: '2026-09-01', to: '2026-09-30', page: 2, pageSize: 5 },
    ]);
  });

  it('should fill only the missing end from the clock when the employee gave the start', async () => {
    const reader = new RecordingAttendanceSummaryReader(emptyPage());
    const service = createService({ instant: NOVEMBER_FIRST_WIB_INSTANT, reader });

    await service.listOwnSummary(ACCOUNT_ID, { from: '2026-10-15', page: 1, pageSize: 20 });

    expect(reader.criteria[0]).toMatchObject({ from: '2026-10-15', to: '2026-11-01' });
  });

  it('should reject the range when the defaulted end falls before the given start', async () => {
    const reader = new RecordingAttendanceSummaryReader(emptyPage());
    const service = createService({ instant: NOVEMBER_FIRST_WIB_INSTANT, reader });

    const pending = service.listOwnSummary(ACCOUNT_ID, {
      from: '2026-12-01',
      page: 1,
      pageSize: 20,
    });

    await expect(pending).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_FAILED,
      kind: 'validation',
    });
    await expect(pending).rejects.toBeInstanceOf(ValidationError);
    expect(reader.criteria).toEqual([]);
  });

  it('should map the stored days to rows and compute the page count from the total', async () => {
    const reader = new RecordingAttendanceSummaryReader({
      records: [CLOCK_IN_ONLY_DAY, WORKED_DAY],
      totalItems: 41,
    });
    const service = createService({ instant: NOVEMBER_FIRST_WIB_INSTANT, reader });

    const page = await service.listOwnSummary(ACCOUNT_ID, { page: 3, pageSize: 20 });

    expect(page).toEqual({
      items: [
        {
          businessDate: '2026-11-02',
          clockInAt: '2026-11-02T02:30:00.000Z',
          clockInStatus: 'LATE_CHECKIN',
          clockOutAt: null,
          clockOutStatus: 'PENDING_CHECKOUT',
        },
        {
          businessDate: '2026-11-01',
          clockInAt: '2026-11-01T01:55:00.000Z',
          clockInStatus: 'ON_TIME_CHECKIN',
          clockOutAt: '2026-11-01T11:00:00.000Z',
          clockOutStatus: 'ON_TIME_CHECKOUT',
        },
      ],
      page: 3,
      pageSize: 20,
      totalItems: 41,
      totalPages: 3,
    });
  });
});

function emptyPage(): AttendanceSummaryRecordPage {
  return { records: [], totalItems: 0 };
}

const CLOCK_IN_ONLY_DAY: AttendanceSummaryRecord = {
  businessDate: '2026-11-02',
  effectiveCheckinAt: new Date('2026-11-02T02:30:00Z'),
  checkinStatusCode: 'LATE_CHECKIN',
  effectiveCheckoutAt: null,
  checkoutStatusCode: 'PENDING_CHECKOUT',
};

const WORKED_DAY: AttendanceSummaryRecord = {
  businessDate: '2026-11-01',
  effectiveCheckinAt: new Date('2026-11-01T01:55:00Z'),
  checkinStatusCode: 'ON_TIME_CHECKIN',
  effectiveCheckoutAt: new Date('2026-11-01T11:00:00Z'),
  checkoutStatusCode: 'ON_TIME_CHECKOUT',
};
