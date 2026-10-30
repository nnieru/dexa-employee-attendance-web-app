import { AuthModule, HealthModule } from '@dexa/common';
import { Module, type Type } from '@nestjs/common';
import { AccountsModule } from './accounts/accounts.module.js';
import type { AuthServiceConfig } from './config/auth-service-config.schema.js';
import { ConfigModule } from './config/config.module.js';
import { CredentialsModule } from './credentials/credentials.module.js';
import { DatabaseModule } from './infrastructure/db/database.module.js';
import { LoginModule } from './login/login.module.js';
import { ProvisioningModule } from './provisioning/provisioning.module.js';

/**
 * Builds the root module from the validated config. AuthModule.forRoot takes the config as a value, so
 * the module graph cannot be declared until the environment has been parsed. bootstrapService takes a
 * module class, so the class is declared inside this function, around the config.
 */
export function createAppModule(config: AuthServiceConfig): Type<unknown> {
  @Module({
    imports: [
      ConfigModule.forRoot(config),
      AuthModule.forRoot(config),
      DatabaseModule,
      CredentialsModule,
      AccountsModule,
      LoginModule,
      ProvisioningModule,
      HealthModule,
    ],
  })
  class AppModule {}
  return AppModule;
}
