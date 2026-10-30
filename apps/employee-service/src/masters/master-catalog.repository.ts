import type { Database } from '@dexa/db';
import type { MasterOption } from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { asc } from 'drizzle-orm';
import { DATABASE } from '../infrastructure/db/database.token.js';
import { masterEmployeeStatuses, masterPositions } from '../infrastructure/db/schema.js';
import type { IMasterCatalogReader } from './master-catalog.reader.interface.js';

// Each column is named explicitly, so a column added to the table never reaches the response by accident.
@Injectable()
export class MasterCatalogRepository implements IMasterCatalogReader {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  listPositions(): Promise<MasterOption[]> {
    return this.database.db
      .select({
        id: masterPositions.id,
        code: masterPositions.code,
        name: masterPositions.name,
        isActive: masterPositions.isActive,
      })
      .from(masterPositions)
      .orderBy(asc(masterPositions.code));
  }

  listEmployeeStatuses(): Promise<MasterOption[]> {
    return this.database.db
      .select({
        id: masterEmployeeStatuses.id,
        code: masterEmployeeStatuses.code,
        name: masterEmployeeStatuses.name,
        isActive: masterEmployeeStatuses.isActive,
      })
      .from(masterEmployeeStatuses)
      .orderBy(asc(masterEmployeeStatuses.code));
  }
}
