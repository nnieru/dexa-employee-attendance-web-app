import {
  AccountStatusModule,
  AuthModule,
  HealthModule,
  InternalHttpModule,
  ServiceName,
} from '@dexa/common';
import { Module, type Type } from '@nestjs/common';
import type { ApiGatewayConfig } from './config/api-gateway-config.schema.js';
import { GatewayAttendanceModule } from './attendance/attendance.module.js';
import { GatewayAuthModule } from './auth/auth.module.js';
import { GatewayEmployeesModule } from './employees/employees.module.js';

/**
 * Builds the root module from the validated config. AuthModule.forRoot and InternalHttpModule.forRoot take
 * the config as values, so the module graph cannot be declared until the environment has been parsed.
 * bootstrapService takes a module class, so the class is declared inside this function.
 */
export function createAppModule(config: ApiGatewayConfig): Type<unknown> {
  @Module({
    imports: [
      AuthModule.forRoot(config),
      InternalHttpModule.forRoot({
        serviceBaseUrls: {
          [ServiceName.AUTH_SERVICE]: config.AUTH_SERVICE_INTERNAL_URL,
          [ServiceName.EMPLOYEE_SERVICE]: config.EMPLOYEE_SERVICE_INTERNAL_URL,
          [ServiceName.ATTENDANCE_SERVICE]: config.ATTENDANCE_SERVICE_INTERNAL_URL,
        },
        authConfig: config,
      }),
      AccountStatusModule.forRemote(),
      GatewayAuthModule,
      GatewayEmployeesModule,
      GatewayAttendanceModule,
      HealthModule,
    ],
  })
  class AppModule {}
  return AppModule;
}
