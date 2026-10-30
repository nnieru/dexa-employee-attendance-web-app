import { Module } from '@nestjs/common';
import { MASTER_DATA_REPOSITORY } from './master-data.repository.interface.js';
import { MasterDataRepository } from './master-data.repository.js';
import { MasterDataSeedService } from './master-data-seed.service.js';

@Module({
  providers: [
    { provide: MASTER_DATA_REPOSITORY, useClass: MasterDataRepository },
    MasterDataSeedService,
  ],
})
export class MasterDataModule {}
