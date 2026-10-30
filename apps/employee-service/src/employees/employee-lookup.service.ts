import type { EmployeeLookupItem } from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import {
  EMPLOYEE_LOOKUP_READER,
  type IEmployeeLookupReader,
} from './employee-lookup-reader.interface.js';
import type { IEmployeeLookupService } from './employee-lookup-service.interface.js';

@Injectable()
export class EmployeeLookupService implements IEmployeeLookupService {
  constructor(@Inject(EMPLOYEE_LOOKUP_READER) private readonly reader: IEmployeeLookupReader) {}

  lookupEmployees(accountIds: ReadonlyArray<string>): Promise<EmployeeLookupItem[]> {
    return this.reader.findEmployeesByAccountIds(accountIds);
  }
}
