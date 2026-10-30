import type { Database } from '@dexa/db';
import { profileStatusSchema } from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE } from '../infrastructure/db/database.token.js';
import { wrapStorageError } from '../infrastructure/db/storage-errors.js';
import { employees, masterEmployeeStatuses, masterPositions } from '../infrastructure/db/schema.js';
import type {
  EmployeeDetailRecord,
  IEmployeeDetailReader,
} from './employee-detail.reader.interface.js';

@Injectable()
export class EmployeeDetailRepository implements IEmployeeDetailReader {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findEmployeeDetail(accountId: string): Promise<EmployeeDetailRecord | undefined> {
    try {
      const [row] = await this.database.db
        .select({
          accountId: employees.accountId,
          name: employees.name,
          phoneNumber: employees.phoneNumber,
          profileStatus: employees.profileStatus,
          positionId: masterPositions.id,
          positionCode: masterPositions.code,
          positionName: masterPositions.name,
          employeeStatusId: masterEmployeeStatuses.id,
          employeeStatusCode: masterEmployeeStatuses.code,
          employeeStatusName: masterEmployeeStatuses.name,
        })
        .from(employees)
        .innerJoin(masterPositions, eq(employees.positionId, masterPositions.id))
        .innerJoin(
          masterEmployeeStatuses,
          eq(employees.employeeStatusId, masterEmployeeStatuses.id),
        )
        .where(eq(employees.accountId, accountId))
        .limit(1);
      if (row === undefined) return undefined;
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
        profileStatus: profileStatusSchema.parse(row.profileStatus),
      };
    } catch (error: unknown) {
      throw wrapStorageError(error, 'The employee profile could not be read.');
    }
  }
}
