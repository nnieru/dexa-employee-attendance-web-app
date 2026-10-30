import { Module } from '@nestjs/common';
import { MASTER_CATALOG_READER } from './master-catalog.reader.interface.js';
import { MasterCatalogRepository } from './master-catalog.repository.js';
import { MASTER_LOOKUP_SERVICE } from './master-lookup.service.interface.js';
import { MasterLookupService } from './master-lookup.service.js';
import { MastersController } from './masters.controller.js';

@Module({
  controllers: [MastersController],
  providers: [
    { provide: MASTER_CATALOG_READER, useClass: MasterCatalogRepository },
    { provide: MASTER_LOOKUP_SERVICE, useClass: MasterLookupService },
  ],
})
export class MastersModule {}
