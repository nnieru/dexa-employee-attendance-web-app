import { AuthModule, HealthModule } from '@dexa/common';
import { MessagingModule, OutboxModule } from '@dexa/messaging';
import { Module, type Type } from '@nestjs/common';
import { AccountsModule } from './accounts/accounts.module.js';
import type { AuthServiceConfig } from './config/auth-service-config.schema.js';
import { ConfigModule } from './config/config.module.js';
import { CredentialsModule } from './credentials/credentials.module.js';
import { DATABASE } from './infrastructure/db/database.token.js';
import { DatabaseModule } from './infrastructure/db/database.module.js';
import { LoginModule } from './login/login.module.js';
import { PasswordModule } from './password/password.module.js';
import { ProvisioningModule } from './provisioning/provisioning.module.js';
import { ClockModule } from './time/clock.module.js';

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
      ClockModule,
      MessagingModule.forRoot({ url: config.RABBITMQ_URL }),
      OutboxModule.forRoot({ databaseToken: DATABASE }),
      CredentialsModule,
      AccountsModule,
      LoginModule,
      ProvisioningModule,
      PasswordModule,
      HealthModule,
    ],
  })
  class AppModule {}
  return AppModule;
}
