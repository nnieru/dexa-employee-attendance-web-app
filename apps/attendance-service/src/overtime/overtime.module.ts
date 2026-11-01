import { Module } from '@nestjs/common';
import { OvertimeRequestController } from './overtime-request.controller.js';
import { OVERTIME_REQUEST_REPOSITORY } from './overtime-request.repository.interface.js';
import { OvertimeRequestRepository } from './overtime-request.repository.js';
import { OVERTIME_REQUEST_SERVICE } from './overtime-request.service.interface.js';
import { OvertimeRequestService } from './overtime-request.service.js';

@Module({
  controllers: [OvertimeRequestController],
  providers: [
    { provide: OVERTIME_REQUEST_SERVICE, useClass: OvertimeRequestService },
    { provide: OVERTIME_REQUEST_REPOSITORY, useClass: OvertimeRequestRepository },
  ],
})
export class OvertimeModule {}
