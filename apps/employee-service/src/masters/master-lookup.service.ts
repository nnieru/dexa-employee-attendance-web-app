import { Inject, Injectable } from '@nestjs/common';
import type { MasterOption } from '@dexa/contracts';
import {
  MASTER_CATALOG_READER,
  type IMasterCatalogReader,
} from './master-catalog.reader.interface.js';
import type { IMasterLookupService } from './master-lookup.service.interface.js';

@Injectable()
export class MasterLookupService implements IMasterLookupService {
  constructor(@Inject(MASTER_CATALOG_READER) private readonly catalogs: IMasterCatalogReader) {}

  listPositions(): Promise<MasterOption[]> {
    return this.catalogs.listPositions();
  }

  listEmployeeStatuses(): Promise<MasterOption[]> {
    return this.catalogs.listEmployeeStatuses();
  }
}
