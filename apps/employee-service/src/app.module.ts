import {
  AccountStatusModule,
  AuthModule,
  HealthModule,
  InternalHttpModule,
  ServiceName,
} from '@dexa/common';
import { MessagingModule, OutboxModule } from '@dexa/messaging';
import { Module, type Type } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import type { EmployeeServiceConfig } from './config/employee-service-config.schema.js';
import { HrProfileBootstrapModule } from './bootstrap/hr-profile-bootstrap.module.js';
import { DATABASE } from './infrastructure/db/database.token.js';
import { DatabaseModule } from './infrastructure/db/database.module.js';
import { EmployeesModule } from './employees/employees.module.js';
import { MasterDataModule } from './master-data/master-data.module.js';
import { MastersModule } from './masters/masters.module.js';
import { PhotoModule } from './photo/photo.module.js';
import { ProfileModule } from './profile/profile.module.js';
import { ProvisioningModule } from './provisioning/provisioning.module.js';
import { ClockModule } from './time/clock.module.js';

/**
 * Builds the root module from the validated config. The config is parsed before the module graph is
 * declared, so the class is declared inside this function, as in auth-service.
 */
export function createAppModule(config: EmployeeServiceConfig): Type<unknown> {
  @Module({
    imports: [
      ConfigModule.forRoot(config),
      AuthModule.forRoot(config),
      InternalHttpModule.forRoot({
        serviceBaseUrls: { [ServiceName.AUTH_SERVICE]: config.AUTH_SERVICE_INTERNAL_URL },
        authConfig: config,
      }),
      AccountStatusModule.forRemote(),
      DatabaseModule,
      ClockModule,
      MessagingModule.forRoot({ url: config.RABBITMQ_URL }),
      OutboxModule.forRoot({ databaseToken: DATABASE }),
      MasterDataModule,
      MastersModule,
      HrProfileBootstrapModule,
      // Registration follows import order. The self-service profile routes come before EmployeesModule, so that
      // PATCH employees/me is not matched by the HR route PATCH employees/:accountId.
      ProfileModule,
      EmployeesModule,
      PhotoModule,
      ProvisioningModule,
      HealthModule,
    ],
  })
  class AppModule {}
  return AppModule;
}
