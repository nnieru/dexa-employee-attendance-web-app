import type { Database } from '@dexa/db';
import { profileStatusSchema } from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE } from '../infrastructure/db/database.token.js';
import { employees, masterPositions } from '../infrastructure/db/schema.js';
import type {
  EmployeeProfileRecord,
  IEmployeeProfileReader,
} from './employee-profile.reader.interface.js';

// Each column is named explicitly, so a column added to the table never reaches a response by accident.
// The position join is on the position's primary key. Every employee has a position (NOT NULL foreign
// key), so the inner join never hides a profile.
@Injectable()
export class EmployeeProfileRepository implements IEmployeeProfileReader {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findProfileByAccountId(accountId: string): Promise<EmployeeProfileRecord | undefined> {
    const [row] = await this.database.db
      .select({
        accountId: employees.accountId,
        name: employees.name,
        positionCode: masterPositions.code,
        positionName: masterPositions.name,
        phoneNumber: employees.phoneNumber,
        photoKey: employees.photoKey,
        profileStatus: employees.profileStatus,
      })
      .from(employees)
      .innerJoin(masterPositions, eq(employees.positionId, masterPositions.id))
      .where(eq(employees.accountId, accountId))
      .limit(1);
    if (row === undefined) return undefined;
    // The check constraint allows only the two codes, so a parse failure means the stored row is corrupt.
    return { ...row, profileStatus: profileStatusSchema.parse(row.profileStatus) };
  }
}
