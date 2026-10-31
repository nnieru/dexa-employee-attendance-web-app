import { AuthModule, HealthModule, InternalHttpModule, ServiceName } from '@dexa/common';
import { Module, type Type } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import type { NotificationServiceConfig } from './config/notification-service-config.schema.js';
import { IngestionModule } from './ingestion/ingestion.module.js';
import { NotificationInboxModule } from './inbox/notification-inbox.module.js';
import { DatabaseModule } from './infrastructure/db/database.module.js';
import { NotificationStreamModule } from './stream/notification-stream.module.js';
import { ClockModule } from './time/clock.module.js';

/**
 * Builds the root module from the validated config. The config is parsed before the module graph is declared,
 * so the class is declared inside this function, as in the other services.
 */
export function createAppModule(config: NotificationServiceConfig): Type<unknown> {
  @Module({
    imports: [
      ConfigModule.forRoot(config),
      AuthModule.forRoot(config),
      InternalHttpModule.forRoot({
        serviceBaseUrls: {
          [ServiceName.AUTH_SERVICE]: config.AUTH_SERVICE_INTERNAL_URL,
          [ServiceName.EMPLOYEE_SERVICE]: config.EMPLOYEE_SERVICE_INTERNAL_URL,
        },
        authConfig: config,
      }),
      ClockModule,
      DatabaseModule,
      IngestionModule,
      NotificationInboxModule,
      NotificationStreamModule,
      HealthModule,
    ],
  })
  class AppModule {}
  return AppModule;
}
