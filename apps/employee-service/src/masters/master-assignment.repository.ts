import type { Database } from '@dexa/db';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE } from '../infrastructure/db/database.token.js';
import { wrapStorageError } from '../infrastructure/db/storage-errors.js';
import { masterEmployeeStatuses, masterPositions } from '../infrastructure/db/schema.js';
import type {
  IMasterAssignmentReader,
  MasterEmployeeStatusOption,
  MasterPositionOption,
} from './master-assignment.reader.interface.js';

@Injectable()
export class MasterAssignmentRepository implements IMasterAssignmentReader {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findPositionOption(positionId: string): Promise<MasterPositionOption> {
    try {
      const [row] = await this.database.db
        .select({ isActive: masterPositions.isActive })
        .from(masterPositions)
        .where(eq(masterPositions.id, positionId))
        .limit(1);
      return row;
    } catch (error: unknown) {
      throw wrapStorageError(error, 'The master position could not be read.');
    }
  }

  async findEmployeeStatusOption(employeeStatusId: string): Promise<MasterEmployeeStatusOption> {
    try {
      const [row] = await this.database.db
        .select({ code: masterEmployeeStatuses.code, isActive: masterEmployeeStatuses.isActive })
        .from(masterEmployeeStatuses)
        .where(eq(masterEmployeeStatuses.id, employeeStatusId))
        .limit(1);
      return row;
    } catch (error: unknown) {
      throw wrapStorageError(error, 'The master employee status could not be read.');
    }
  }
}
