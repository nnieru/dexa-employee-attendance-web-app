import { profileStatusSchema, type ProfileStatus } from '@dexa/contracts';
import type { Database } from '@dexa/db';
import { Inject, Injectable } from '@nestjs/common';
import { asc, count, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import { DATABASE } from '../infrastructure/db/database.token.js';
import { employees, masterEmployeeStatuses, masterPositions } from '../infrastructure/db/schema.js';
import {
  type EmployeeListCriteria,
  type EmployeeListRecord,
  type EmployeeListRecordPage,
  type EmployeeListSearch,
  type IEmployeeListReader,
} from './employee-list-reader.interface.js';
import { toNameContainsPattern } from './name-search.rules.js';

// The flat row that the joins return. It is mapped to the record below, so the response never sees raw columns.
type EmployeeListRow = {
  readonly accountId: string;
  readonly name: string;
  readonly positionId: string;
  readonly positionCode: string;
  readonly positionName: string;
  readonly employeeStatusId: string;
  readonly employeeStatusCode: string;
  readonly employeeStatusName: string;
  readonly phoneNumber: string | null;
  readonly photoKey: string | null;
  readonly profileStatus: string;
};

// Both masters join on their primary keys. Every employee has a position and a status (NOT NULL foreign keys),
// so the inner joins never hide a profile. Each column is named explicitly, as in the other readers.
// Ordering by name, then by account ID, keeps pages stable when two employees share a name.
@Injectable()
export class EmployeeListRepository implements IEmployeeListReader {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findEmployeePage(criteria: EmployeeListCriteria): Promise<EmployeeListRecordPage> {
    const condition = buildSearchCondition(criteria.search);
    const rows: EmployeeListRow[] = await this.database.db
      .select({
        accountId: employees.accountId,
        name: employees.name,
        positionId: masterPositions.id,
        positionCode: masterPositions.code,
        positionName: masterPositions.name,
        employeeStatusId: masterEmployeeStatuses.id,
        employeeStatusCode: masterEmployeeStatuses.code,
        employeeStatusName: masterEmployeeStatuses.name,
        phoneNumber: employees.phoneNumber,
        photoKey: employees.photoKey,
        profileStatus: employees.profileStatus,
      })
      .from(employees)
      .innerJoin(masterPositions, eq(employees.positionId, masterPositions.id))
      .innerJoin(masterEmployeeStatuses, eq(employees.employeeStatusId, masterEmployeeStatuses.id))
      .where(condition)
      .orderBy(asc(employees.name), asc(employees.accountId))
      .limit(criteria.pageSize)
      .offset((criteria.page - 1) * criteria.pageSize);
    const [totals] = await this.database.db
      .select({ total: count() })
      .from(employees)
      .where(condition);
    return { records: rows.map(toEmployeeListRecord), totalItems: totals?.total ?? 0 };
  }
}

// Without a search, the condition is absent and every employee matches. With one, a name match and an email
// match (an account ID from Auth) are one predicate, so both count toward the same page and total.
function buildSearchCondition(search: EmployeeListSearch | undefined): SQL | undefined {
  if (search === undefined) return undefined;
  const nameMatches = sql`lower(${employees.name}) like lower(${toNameContainsPattern(search.nameTerm)})`;
  if (search.emailMatchAccountIds.length === 0) return nameMatches;
  return or(nameMatches, inArray(employees.accountId, [...search.emailMatchAccountIds]));
}

function toEmployeeListRecord(row: EmployeeListRow): EmployeeListRecord {
  return {
    accountId: row.accountId,
    name: row.name,
    position: { id: row.positionId, code: row.positionCode, name: row.positionName },
    employeeStatus: {
      id: row.employeeStatusId,
      code: row.employeeStatusCode,
      name: row.employeeStatusName,
    },
    phoneNumber: row.phoneNumber,
    photoKey: row.photoKey,
    profileStatus: parseProfileStatus(row.profileStatus),
  };
}

// The check constraint allows only the two codes, so a parse failure means the stored row is corrupt.
function parseProfileStatus(value: string): ProfileStatus {
  return profileStatusSchema.parse(value);
}
