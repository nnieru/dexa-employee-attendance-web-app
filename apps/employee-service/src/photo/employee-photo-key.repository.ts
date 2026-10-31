import type { Database } from '@dexa/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, inArray, isNotNull } from 'drizzle-orm';
import { DATABASE } from '../infrastructure/db/database.token.js';
import { employees } from '../infrastructure/db/schema.js';
import type {
  EmployeePhotoKeyRecord,
  IEmployeePhotoKeyReader,
} from './employee-photo-key.reader.interface.js';

@Injectable()
export class EmployeePhotoKeyRepository implements IEmployeePhotoKeyReader {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findPhotoKeysByAccountIds(
    accountIds: ReadonlyArray<string>,
  ): Promise<EmployeePhotoKeyRecord[]> {
    const rows = await this.database.db
      .select({ accountId: employees.accountId, photoKey: employees.photoKey })
      .from(employees)
      .where(and(inArray(employees.accountId, [...accountIds]), isNotNull(employees.photoKey)));
    // The IS NOT NULL filter guarantees a key on every row; the narrowing keeps the record type exact.
    return rows.flatMap((row) =>
      row.photoKey === null ? [] : [{ accountId: row.accountId, photoKey: row.photoKey }],
    );
  }
}
