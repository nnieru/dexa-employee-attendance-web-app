import type { EmployeeLookupItem } from '@dexa/contracts';
import type { Database } from '@dexa/db';
import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, inArray } from 'drizzle-orm';
import { DATABASE } from '../infrastructure/db/database.token.js';
import { employees, masterPositions } from '../infrastructure/db/schema.js';
import type { IEmployeeLookupReader } from './employee-lookup-reader.interface.js';

// Each column is named explicitly, so a column added to the table never reaches the response by accident.
// The position join is on the position's primary key. Every employee has a position (NOT NULL foreign key),
// so the inner join never hides a profile. The IN list may repeat an ID, but each employee row is returned once.
@Injectable()
export class EmployeeLookupRepository implements IEmployeeLookupReader {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  findEmployeesByAccountIds(accountIds: ReadonlyArray<string>): Promise<EmployeeLookupItem[]> {
    return this.database.db
      .select({
        accountId: employees.accountId,
        name: employees.name,
        positionName: masterPositions.name,
      })
      .from(employees)
      .innerJoin(masterPositions, eq(employees.positionId, masterPositions.id))
      .where(inArray(employees.accountId, [...accountIds]))
      .orderBy(asc(employees.accountId));
  }
}
