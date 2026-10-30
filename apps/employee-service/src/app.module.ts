import { AuthModule, HealthModule } from '@dexa/common';
import { Module, type Type } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import type { EmployeeServiceConfig } from './config/employee-service-config.schema.js';
import { DatabaseModule } from './infrastructure/db/database.module.js';
import { MasterDataModule } from './master-data/master-data.module.js';
import { MastersModule } from './masters/masters.module.js';

/**
 * Builds the root module from the validated config. The config is parsed before the module graph is
 * declared, so the class is declared inside this function, as in auth-service.
 */
export function createAppModule(config: EmployeeServiceConfig): Type<unknown> {
  @Module({
    imports: [
      ConfigModule.forRoot(config),
      AuthModule.forRoot(config),
      DatabaseModule,
      MasterDataModule,
      MastersModule,
      HealthModule,
    ],
  })
  class AppModule {}
  return AppModule;
}
