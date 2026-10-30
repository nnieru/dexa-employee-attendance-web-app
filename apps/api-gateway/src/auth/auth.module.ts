import { RolesGuard } from '@dexa/common';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccountStatusClient } from './account-status.client.js';
import { ACCOUNT_STATUS_CLIENT } from './account-status-client.interface.js';
import { AuthServiceClient } from './auth-service.client.js';
import { AUTH_SERVICE_CLIENT } from './auth-service-client.interface.js';
import { AuthController } from './auth.controller.js';
import { GatewayJwtAuthGuard } from './gateway-jwt-auth.guard.js';

// Nest runs global guards in provider order, so the token is verified before the role check reads it.
@Module({
  controllers: [AuthController],
  providers: [
    { provide: AUTH_SERVICE_CLIENT, useClass: AuthServiceClient },
    { provide: ACCOUNT_STATUS_CLIENT, useClass: AccountStatusClient },
    { provide: APP_GUARD, useClass: GatewayJwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class GatewayAuthModule {}
