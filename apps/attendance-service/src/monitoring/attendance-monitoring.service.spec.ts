import { DependencyUnavailableError, ValidationError, type IClock } from '@dexa/common';
import { ErrorCode, type EmployeeLookupItem } from '@dexa/contracts';
import type { IEmployeeClient } from '../employees/employee-client.interface.js';
import type {
  AttendanceMonitoringCriteria,
  AttendanceMonitoringRecord,
  AttendanceMonitoringRecordPage,
  IAttendanceMonitoringReader,
} from './attendance-monitoring.repository.interface.js';
import { AttendanceMonitoringService } from './attendance-monitoring.service.js';

const NADIA_ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const BIMA_ACCOUNT_ID = '7a1d2e3f-4b5c-4d6e-8f70-1a2b3c4d5e6f';
const UNKNOWN_ACCOUNT_ID = '0b9e8d7c-6b5a-4f3e-8d2c-1b0a9f8e7d6c';
const TIMEZONE = 'Asia/Jakarta';
// 03:00 UTC on 2026-11-03 is 10:00 WIB on 2026-11-03.
const TUESDAY_MORNING_INSTANT = new Date('2026-11-03T03:00:00Z');

const NADIA: EmployeeLookupItem = {
  accountId: NADIA_ACCOUNT_ID,
  name: 'Nadia Rahma',
  positionName: 'Fullstack Developer',
};
const BIMA: EmployeeLookupItem = {
  accountId: BIMA_ACCOUNT_ID,
  name: 'Bima Saputra',
  positionName: 'HR Officer',
};

class RecordingMonitoringReader implements IAttendanceMonitoringReader {
  readonly criteria: AttendanceMonitoringCriteria[] = [];

  constructor(private readonly page: AttendanceMonitoringRecordPage) {}

  findDayPage(criteria: AttendanceMonitoringCriteria): Promise<AttendanceMonitoringRecordPage> {
    this.criteria.push(criteria);
    return Promise.resolve(this.page);
  }
}

class RecordingEmployeeClient implements IEmployeeClient {
  readonly lookups: ReadonlyArray<string>[] = [];

  constructor(private readonly answer: () => Promise<EmployeeLookupItem[]>) {}

  lookupEmployees(accountIds: ReadonlyArray<string>): Promise<EmployeeLookupItem[]> {
    this.lookups.push(accountIds);
    return this.answer();
  }
}

function createService(options: {
  readonly reader: IAttendanceMonitoringReader;
  readonly employees: IEmployeeClient;
}): AttendanceMonitoringService {
  const clock: IClock = { now: () => new Date(TUESDAY_MORNING_INSTANT) };
  return new AttendanceMonitoringService(options.reader, options.employees, clock, {
    BUSINESS_TIMEZONE: TIMEZONE,
  });
}

function dayOf(accountId: string, businessDate: string): AttendanceMonitoringRecord {
  return {
    accountId,
    businessDate,
    dayStatusCode: 'PRESENT',
    effectiveCheckinAt: new Date(`${businessDate}T02:00:00Z`),
    checkinStatusCode: 'ON_TIME_CHECKIN',
    effectiveCheckoutAt: null,
    checkoutStatusCode: 'PENDING_CHECKOUT',
    approvedOvertimeMinutes: 0,
    rawClockInAt: new Date(`${businessDate}T02:00:00Z`),
    rawClockOutAt: null,
    isCorrected: false,
  };
}

describe('AttendanceMonitoringService.listAttendance', () => {
  it('should search every account from the first of the business month to today when no filter is given', async () => {
    const reader = new RecordingMonitoringReader({ records: [], totalItems: 0 });
    const service = createService({
      reader,
      employees: new RecordingEmployeeClient(() => Promise.resolve([])),
    });

    await service.listAttendance({ page: 1, pageSize: 20 });

    expect(reader.criteria).toEqual([
      { accountId: undefined, from: '2026-11-01', to: '2026-11-03', page: 1, pageSize: 20 },
    ]);
  });

  it('should search only the given employee and range when HR filters by them', async () => {
    const reader = new RecordingMonitoringReader({ records: [], totalItems: 0 });
    const service = createService({
      reader,
      employees: new RecordingEmployeeClient(() => Promise.resolve([])),
    });

    await service.listAttendance({
      from: '2026-09-01',
      to: '2026-09-30',
      employeeId: NADIA_ACCOUNT_ID,
      page: 2,
      pageSize: 5,
    });

    expect(reader.criteria).toEqual([
      { accountId: NADIA_ACCOUNT_ID, from: '2026-09-01', to: '2026-09-30', page: 2, pageSize: 5 },
    ]);
  });

  it('should reject the range without reading when the defaulted end falls before the given start', async () => {
    const reader = new RecordingMonitoringReader({ records: [], totalItems: 0 });
    const service = createService({
      reader,
      employees: new RecordingEmployeeClient(() => Promise.resolve([])),
    });

    const pending = service.listAttendance({ from: '2026-12-01', page: 1, pageSize: 20 });

    await expect(pending).rejects.toBeInstanceOf(ValidationError);
    await expect(pending).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
    expect(reader.criteria).toEqual([]);
  });

  it('should look up each distinct account on the page once, in one batched call', async () => {
    const reader = new RecordingMonitoringReader({
      records: [
        dayOf(NADIA_ACCOUNT_ID, '2026-11-03'),
        dayOf(BIMA_ACCOUNT_ID, '2026-11-03'),
        dayOf(NADIA_ACCOUNT_ID, '2026-11-02'),
      ],
      totalItems: 3,
    });
    const employees = new RecordingEmployeeClient(() => Promise.resolve([NADIA, BIMA]));
    const service = createService({ reader, employees });

    await service.listAttendance({ page: 1, pageSize: 20 });

    expect(employees.lookups).toEqual([[NADIA_ACCOUNT_ID, BIMA_ACCOUNT_ID]]);
  });

  it('should not call Employee when the page is empty', async () => {
    const reader = new RecordingMonitoringReader({ records: [], totalItems: 0 });
    const employees = new RecordingEmployeeClient(() => Promise.resolve([]));
    const service = createService({ reader, employees });

    const page = await service.listAttendance({ page: 1, pageSize: 20 });

    expect(employees.lookups).toEqual([]);
    expect(page).toEqual({ items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
  });

  it('should show the name and position, and show an unknown account as unavailable', async () => {
    const reader = new RecordingMonitoringReader({
      records: [dayOf(NADIA_ACCOUNT_ID, '2026-11-03'), dayOf(UNKNOWN_ACCOUNT_ID, '2026-11-03')],
      totalItems: 41,
    });
    const service = createService({
      reader,
      employees: new RecordingEmployeeClient(() => Promise.resolve([NADIA])),
    });

    const page = await service.listAttendance({ page: 3, pageSize: 20 });

    expect(page).toEqual({
      items: [
        {
          accountId: NADIA_ACCOUNT_ID,
          employee: { name: 'Nadia Rahma', positionName: 'Fullstack Developer' },
          businessDate: '2026-11-03',
          dayStatus: 'PRESENT',
          approvedOvertimeMinutes: 0,
          rawClockInAt: '2026-11-03T02:00:00.000Z',
          rawClockOutAt: null,
          isCorrected: false,
          clockInAt: '2026-11-03T02:00:00.000Z',
          clockInStatus: 'ON_TIME_CHECKIN',
          clockOutAt: null,
          clockOutStatus: 'PENDING_CHECKOUT',
        },
        expect.objectContaining({ accountId: UNKNOWN_ACCOUNT_ID, employee: null }),
      ],
      page: 3,
      pageSize: 20,
      totalItems: 41,
      totalPages: 3,
    });
  });

  it('should reject when Employee is unavailable, so names never silently read as unavailable', async () => {
    const outage = new DependencyUnavailableError(ErrorCode.DEPENDENCY_UNAVAILABLE, 'Unavailable.');
    const reader = new RecordingMonitoringReader({
      records: [dayOf(NADIA_ACCOUNT_ID, '2026-11-03')],
      totalItems: 1,
    });
    const service = createService({
      reader,
      employees: new RecordingEmployeeClient(() => Promise.reject(outage)),
    });

    await expect(service.listAttendance({ page: 1, pageSize: 20 })).rejects.toBe(outage);
  });
});
