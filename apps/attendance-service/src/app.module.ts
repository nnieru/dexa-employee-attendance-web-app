import {
  AccountStatusModule,
  AuthModule,
  HealthModule,
  InternalHttpModule,
  ServiceName,
} from '@dexa/common';
import { Module, type Type } from '@nestjs/common';
import type { AttendanceServiceConfig } from './config/attendance-service-config.schema.js';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './infrastructure/db/database.module.js';
import { PunchesModule } from './punches/punches.module.js';
import { SchedulesModule } from './schedules/schedules.module.js';
import { AttendanceSummaryModule } from './summary/attendance-summary.module.js';
import { ClockModule } from './time/clock.module.js';

/**
 * Builds the root module from the validated config. The config is parsed before the module graph is declared, so
 * the class is declared inside this function, as in employee-service.
 */
export function createAppModule(config: AttendanceServiceConfig): Type<unknown> {
  @Module({
    imports: [
      ConfigModule.forRoot(config),
      AuthModule.forRoot(config),
      InternalHttpModule.forRoot({
        serviceBaseUrls: { [ServiceName.AUTH_SERVICE]: config.AUTH_SERVICE_INTERNAL_URL },
        authConfig: config,
      }),
      AccountStatusModule.forRemote(),
      ClockModule,
      DatabaseModule,
      SchedulesModule,
      PunchesModule,
      AttendanceSummaryModule,
      HealthModule,
    ],
  })
  class AppModule {}
  return AppModule;
}
