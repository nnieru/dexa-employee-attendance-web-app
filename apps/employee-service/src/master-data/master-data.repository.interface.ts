import type { MasterDataDocument } from '../config/master-data-setting.schema.js';

export const MASTER_DATA_REPOSITORY = Symbol('MASTER_DATA_REPOSITORY');

export type MasterDataSeedCounts = {
  readonly positionsInserted: number;
  readonly employeeStatusesInserted: number;
};

export interface IMasterDataRepository {
  /** True when either master table holds at least one row, whatever its activation state. */
  hasAnyMasterRow(): Promise<boolean>;
  /**
   * Inserts the configured rows that do not exist yet, in one transaction. A code that already exists
   * keeps its label and activation state, so repeated seeds never change catalog rows.
   */
  seedMasterData(document: MasterDataDocument): Promise<MasterDataSeedCounts>;
}
