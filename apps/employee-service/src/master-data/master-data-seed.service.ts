import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { EmployeeServiceConfig } from '../config/employee-service-config.schema.js';
import { CONFIG } from '../config/config.token.js';
import {
  MASTER_DATA_REPOSITORY,
  type IMasterDataRepository,
} from './master-data.repository.interface.js';
import type { IMasterDataSeeder } from './master-data-seeder.interface.js';

@Injectable()
export class MasterDataSeedService implements IMasterDataSeeder, OnApplicationBootstrap {
  private readonly logger = new Logger(MasterDataSeedService.name);
  private seeding: Promise<void> | undefined;

  constructor(
    @Inject(CONFIG) private readonly config: EmployeeServiceConfig,
    @Inject(MASTER_DATA_REPOSITORY) private readonly masterData: IMasterDataRepository,
  ) {}

  // Nest runs the migrations in onModuleInit before this hook, so the master tables exist here.
  async onApplicationBootstrap(): Promise<void> {
    await this.ensureSeeded();
  }

  // The run is shared, so a caller that starts first does not race a second seed of the same rows.
  ensureSeeded(): Promise<void> {
    this.seeding ??= this.seedOrWarn();
    return this.seeding;
  }

  private async seedOrWarn(): Promise<void> {
    const document = this.config.EMPLOYEE_MASTER_DATA;
    if (document === undefined) {
      await this.warnWhenMasterDataIsEmpty();
      return;
    }
    const counts = await this.masterData.seedMasterData(document);
    this.logger.log(
      `Master data seeded: ${counts.positionsInserted} positions and ${counts.employeeStatusesInserted} employee statuses inserted. Existing rows were left unchanged.`,
    );
  }

  private async warnWhenMasterDataIsEmpty(): Promise<void> {
    if (await this.masterData.hasAnyMasterRow()) return;
    this.logger.warn(
      'Master data tables are empty and EMPLOYEE_MASTER_DATA is not set. Positions and employee statuses cannot be assigned until the masters are configured.',
    );
  }
}
