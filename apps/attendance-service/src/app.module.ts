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
import { CalendarModule } from './calendar/calendar.module.js';
import { AttendanceMonitoringModule } from './monitoring/attendance-monitoring.module.js';
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
        serviceBaseUrls: {
          [ServiceName.AUTH_SERVICE]: config.AUTH_SERVICE_INTERNAL_URL,
          [ServiceName.EMPLOYEE_SERVICE]: config.EMPLOYEE_SERVICE_INTERNAL_URL,
        },
        authConfig: config,
      }),
      AccountStatusModule.forRemote(),
      ClockModule,
      DatabaseModule,
      SchedulesModule,
      CalendarModule,
      PunchesModule,
      AttendanceSummaryModule,
      AttendanceMonitoringModule,
      HealthModule,
    ],
  })
  class AppModule {}
  return AppModule;
}
