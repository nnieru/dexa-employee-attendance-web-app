import { Inject, Injectable } from '@nestjs/common';
import type { Database } from '@dexa/db';
import type { MasterDataDocument } from '../config/master-data-setting.schema.js';
import { DATABASE } from '../infrastructure/db/database.token.js';
import { masterEmployeeStatuses, masterPositions } from '../infrastructure/db/schema.js';
import type {
  IMasterDataRepository,
  MasterDataSeedCounts,
} from './master-data.repository.interface.js';

@Injectable()
export class MasterDataRepository implements IMasterDataRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async hasAnyMasterRow(): Promise<boolean> {
    const positionRows = await this.database.db
      .select({ id: masterPositions.id })
      .from(masterPositions)
      .limit(1);
    if (positionRows.length > 0) return true;
    const statusRows = await this.database.db
      .select({ id: masterEmployeeStatuses.id })
      .from(masterEmployeeStatuses)
      .limit(1);
    return statusRows.length > 0;
  }

  seedMasterData(document: MasterDataDocument): Promise<MasterDataSeedCounts> {
    // An empty VALUES list is not valid SQL, so an empty catalog inserts nothing for that table.
    return this.database.db.transaction(async (transaction): Promise<MasterDataSeedCounts> => {
      const insertedPositions =
        document.positions.length === 0
          ? []
          : await transaction
              .insert(masterPositions)
              .values([...document.positions])
              .onConflictDoNothing({ target: masterPositions.code })
              .returning({ id: masterPositions.id });
      const insertedStatuses =
        document.employeeStatuses.length === 0
          ? []
          : await transaction
              .insert(masterEmployeeStatuses)
              .values([...document.employeeStatuses])
              .onConflictDoNothing({ target: masterEmployeeStatuses.code })
              .returning({ id: masterEmployeeStatuses.id });
      return {
        positionsInserted: insertedPositions.length,
        employeeStatusesInserted: insertedStatuses.length,
      };
    });
  }
}
