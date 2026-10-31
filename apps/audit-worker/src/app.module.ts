import { HealthModule } from '@dexa/common';
import { Module, type Type } from '@nestjs/common';
import { AuditModule } from './audit/audit.module.js';
import { ConfigModule } from './config/config.module.js';
import type { AuditWorkerConfig } from './config/audit-worker-config.schema.js';
import { DatabaseModule } from './infrastructure/db/database.module.js';
import { ClockModule } from './time/clock.module.js';

/**
 * Builds the root module from the validated config. The config is parsed before the module graph is declared,
 * so the class is declared inside this function, as in employee-service.
 */
export function createAppModule(config: AuditWorkerConfig): Type<unknown> {
  @Module({
    imports: [ConfigModule.forRoot(config), DatabaseModule, ClockModule, AuditModule, HealthModule],
  })
  class AppModule {}
  return AppModule;
}
