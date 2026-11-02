import type { MasterOption } from '@dexa/contracts';

export const MASTER_CATALOG_READER = Symbol('MASTER_CATALOG_READER');

/**
 * Reads the master catalogs for the HR lookups. It is read-only on purpose: writes to the catalogs are
 * not part of any API, so consumers of this port cannot change a catalog.
 */
export interface IMasterCatalogReader {
  /** Every position, active and inactive, ordered by code. */
  listPositions(): Promise<MasterOption[]>;
  /** Every employee status, active and inactive, ordered by code. */
  listEmployeeStatuses(): Promise<MasterOption[]>;
}
