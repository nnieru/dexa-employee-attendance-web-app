import { Module } from '@nestjs/common';
import { MASTER_DATA_REPOSITORY } from './master-data.repository.interface.js';
import { MasterDataRepository } from './master-data.repository.js';
import { MASTER_DATA_SEEDER } from './master-data-seeder.interface.js';
import { MasterDataSeedService } from './master-data-seed.service.js';

@Module({
  providers: [
    { provide: MASTER_DATA_REPOSITORY, useClass: MasterDataRepository },
    MasterDataSeedService,
    { provide: MASTER_DATA_SEEDER, useExisting: MasterDataSeedService },
  ],
  exports: [MASTER_DATA_SEEDER],
})
export class MasterDataModule {}
