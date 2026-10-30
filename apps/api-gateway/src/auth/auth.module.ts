import { Module } from '@nestjs/common';
import { AuthServiceClient } from './auth-service.client.js';
import { AUTH_SERVICE_CLIENT } from './auth-service-client.interface.js';
import { AuthController } from './auth.controller.js';

@Module({
  controllers: [AuthController],
  providers: [{ provide: AUTH_SERVICE_CLIENT, useClass: AuthServiceClient }],
})
export class GatewayAuthModule {}
