import type { Database } from '@dexa/db';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE } from '../infrastructure/db/database.token.js';
import { employees, masterEmployeeStatuses, masterPositions } from '../infrastructure/db/schema.js';
import type {
  HrProfileInsertOutcome,
  IHrProfileRepository,
  MasterOptionReference,
  NewHrProfile,
} from './hr-profile.repository.interface.js';

@Injectable()
export class HrProfileRepository implements IHrProfileRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findPositionByCode(code: string): Promise<MasterOptionReference | undefined> {
    const [row] = await this.database.db
      .select({ id: masterPositions.id, isActive: masterPositions.isActive })
      .from(masterPositions)
      .where(eq(masterPositions.code, code))
      .limit(1);
    return row;
  }

  async findEmployeeStatusByCode(code: string): Promise<MasterOptionReference | undefined> {
    const [row] = await this.database.db
      .select({ id: masterEmployeeStatuses.id, isActive: masterEmployeeStatuses.isActive })
      .from(masterEmployeeStatuses)
      .where(eq(masterEmployeeStatuses.code, code))
      .limit(1);
    return row;
  }

  // ON CONFLICT on the primary key makes the insert a no-op for an existing profile, so a restart and a
  // concurrent replica both leave the first row as it was.
  async insertProfileIfAbsent(profile: NewHrProfile): Promise<HrProfileInsertOutcome> {
    const inserted = await this.database.db
      .insert(employees)
      .values({
        accountId: profile.accountId,
        name: profile.name,
        positionId: profile.positionId,
        employeeStatusId: profile.employeeStatusId,
        profileStatus: profile.profileStatus,
        phoneNumber: null,
        photoKey: null,
      })
      .onConflictDoNothing({ target: employees.accountId })
      .returning({ accountId: employees.accountId });
    return inserted.length > 0 ? 'CREATED' : 'ALREADY_PRESENT';
  }
}
