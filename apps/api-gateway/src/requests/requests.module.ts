import { Module } from '@nestjs/common';
import { OVERTIME_REQUEST_CLIENT } from './overtime-request-client.interface.js';
import { OvertimeRequestClient } from './overtime-request.client.js';
import { OvertimeRequestController } from './overtime-request.controller.js';

@Module({
  controllers: [OvertimeRequestController],
  providers: [{ provide: OVERTIME_REQUEST_CLIENT, useClass: OvertimeRequestClient }],
})
export class GatewayRequestsModule {}
