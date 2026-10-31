import { CLOCK, toBusinessDate, type IClock } from '@dexa/common';
import type {
  AttendanceMonitoringPage,
  AttendanceMonitoringQuery,
  EmployeeLookupItem,
} from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { CONFIG } from '../config/config.token.js';
import type { AttendanceServiceConfig } from '../config/attendance-service-config.schema.js';
import { EMPLOYEE_CLIENT, type IEmployeeClient } from '../employees/employee-client.interface.js';
import { resolveAttendanceRange } from '../summary/attendance-range.rules.js';
import {
  ATTENDANCE_MONITORING_READER,
  type IAttendanceMonitoringReader,
} from './attendance-monitoring.repository.interface.js';
import {
  getDistinctAccountIds,
  toAttendanceMonitoringItem,
  toAttendanceMonitoringPage,
} from './attendance-monitoring.rules.js';
import type { IAttendanceMonitoringService } from './attendance-monitoring.service.interface.js';

@Injectable()
export class AttendanceMonitoringService implements IAttendanceMonitoringService {
  constructor(
    @Inject(ATTENDANCE_MONITORING_READER) private readonly reader: IAttendanceMonitoringReader,
    @Inject(EMPLOYEE_CLIENT) private readonly employees: IEmployeeClient,
    @Inject(CLOCK) private readonly clock: IClock,
    @Inject(CONFIG) private readonly config: Pick<AttendanceServiceConfig, 'BUSINESS_TIMEZONE'>,
  ) {}

  // Names are resolved after the page is read, with one batched lookup for the page (DATABASE §8). The page size is
  // bounded by MAX_PAGE_SIZE, which is no larger than EMPLOYEE_LOOKUP_MAX_IDS, so one lookup always fits.
  async listAttendance(query: AttendanceMonitoringQuery): Promise<AttendanceMonitoringPage> {
    const today = toBusinessDate(this.clock.now(), this.config.BUSINESS_TIMEZONE);
    const range = resolveAttendanceRange(query, today);
    const { records, totalItems } = await this.reader.findDayPage({
      ...range,
      accountId: query.employeeId,
      page: query.page,
      pageSize: query.pageSize,
    });
    const employeeByAccountId = await this.findEmployeeByAccountId(getDistinctAccountIds(records));
    const items = records.map((record) => toAttendanceMonitoringItem(record, employeeByAccountId));
    return toAttendanceMonitoringPage(items, query, totalItems);
  }

  // An empty page needs no names, and the lookup refuses an empty ID list.
  private async findEmployeeByAccountId(
    accountIds: ReadonlyArray<string>,
  ): Promise<ReadonlyMap<string, EmployeeLookupItem>> {
    if (accountIds.length === 0) return new Map();
    const employees = await this.employees.lookupEmployees(accountIds);
    return new Map(employees.map((employee) => [employee.accountId, employee]));
  }
}
