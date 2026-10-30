import type { MasterOption } from '@dexa/contracts';

export const MASTER_LOOKUP_SERVICE = Symbol('IMasterLookupService');

/** The HR lookups of the master catalogs. Controllers depend on this port, not on the reader. */
export interface IMasterLookupService {
  listPositions(): Promise<MasterOption[]>;
  listEmployeeStatuses(): Promise<MasterOption[]>;
}
