import { Module } from '@nestjs/common';
import { CORRECTION_REQUEST_CLIENT } from './correction-request-client.interface.js';
import { CorrectionRequestClient } from './correction-request.client.js';
import { CorrectionRequestController } from './correction-request.controller.js';
import { OVERTIME_REQUEST_CLIENT } from './overtime-request-client.interface.js';
import { OvertimeRequestClient } from './overtime-request.client.js';
import { OvertimeRequestController } from './overtime-request.controller.js';

@Module({
  controllers: [OvertimeRequestController, CorrectionRequestController],
  providers: [
    { provide: OVERTIME_REQUEST_CLIENT, useClass: OvertimeRequestClient },
    { provide: CORRECTION_REQUEST_CLIENT, useClass: CorrectionRequestClient },
  ],
})
export class GatewayRequestsModule {}
